import { createHmac } from 'node:crypto'
import type Redis from 'ioredis'
import { toBase62, clampCode } from './base62'
import { useRuntimeConfig } from '#imports'

const LUA_UPSERT = `
-- KEYS[1] = codeKey (sl:{code})
-- KEYS[2] = urlKey (url:{hash})
-- ARGV[1] = longUrl
-- ARGV[2] = ttl (optional, 0 for none)
local exists = redis.call('EXISTS', KEYS[1])
if exists == 1 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[1])
if tonumber(ARGV[2]) and tonumber(ARGV[2]) > 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
-- optional reverse index for dedupe: long url -> code
if #KEYS[2] > 0 then
  redis.call('SET', KEYS[2], string.sub(KEYS[1], 4)) -- store code without 'sl:'
  if tonumber(ARGV[2]) and tonumber(ARGV[2]) > 0 then
    redis.call('PEXPIRE', KEYS[2], ARGV[2])
  end
end
return 1
`

export async function generateAndStoreCode(
  r: Redis,
  longUrl: string,
  opts?: { codeLength?: number; maxRetries?: number; ttlMs?: number; dedupeHash?: string | null }
): Promise<string> {
  const { codeSecret } = useRuntimeConfig()
  const codeLength = opts?.codeLength ?? 7
  const maxRetries = opts?.maxRetries ?? 5
  const ttlMs = opts?.ttlMs ?? 0
  const dedupeHash = opts?.dedupeHash ?? null

  // Try dedupe first
  if (dedupeHash) {
    const existing = await r.get(`url:${dedupeHash}`)
    if (existing) return existing
  }

  const scriptSha = await r.script('LOAD', LUA_UPSERT)
  for (let i = 0; i <= maxRetries; i++) {
    const h = createHmac('sha256', codeSecret)
      .update(longUrl)
      .update(String(Date.now()))
      .update(String(i))
      .digest()
    let code = clampCode(toBase62(h), codeLength)
    // Ensure starts with alnum (it always will) and length is 6-8
    if (code.length < 6) code = code.padEnd(6, '0')
    if (code.length > 8) code = code.slice(0, 8)

    const ok = await r.evalsha(
      scriptSha,
      2,
      `sl:${code}`,
      dedupeHash ? `url:${dedupeHash}` : '',
      longUrl,
      String(ttlMs)
    )
    if (ok === 1) return code
    // else collision, retry
  }
  throw createError({ statusCode: 500, statusMessage: 'Failed to allocate short code after retries' })
}
