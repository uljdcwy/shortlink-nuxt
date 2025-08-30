import { redis } from '~/server/utils/redis'
import { assertValidUrl, clientIp } from '~/server/utils/validate'
import { rateLimitPerIp } from '~/server/utils/rate-limit'
import { generateAndStoreCode } from '~/server/utils/codegen'
import { createHash } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
const r = redis()
export default defineEventHandler(async (event) => {


  // Rate limit: 10 per minute per IP
  const ip = clientIp(event);
  console.log(ip,"ip")
  const rl = await rateLimitPerIp(r, ip, 10, 60)
  if (!rl.allowed) {
    throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' })
  }

  const body = await readBody<{ url?: string }>(event)
  if (!body?.url) {
    throw createError({ statusCode: 400, statusMessage: 'Missing "url" in body' })
  }

  const parsed = assertValidUrl(body.url)

  // Optional dedupe: hash normalized URL
  const normalized = parsed.toString()
  const dedupeHash = createHash('sha256').update(normalized).digest('hex')

  const code = await generateAndStoreCode(r, normalized, {
    codeLength: 7,
    maxRetries: 7,
    ttlMs: 0,
    dedupeHash
  })

  const { baseUrl } = useRuntimeConfig()
  console.log(baseUrl,"baseUrl")
  return {
    short_code: code,
    short_url: `${baseUrl.replace(/\/$/, '')}/api/${code}`
  }
})
