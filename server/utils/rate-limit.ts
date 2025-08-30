import type Redis from 'ioredis'

export async function rateLimitPerIp(
  r: Redis,
  ip: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `rl:${ip}:${Math.floor(Date.now() / (windowSec * 1000))}`
  const count = await r.incr(key)
  if (count === 1) {
    await r.expire(key, windowSec)
  }
  const allowed = count <= limit
  const ttl = await r.ttl(key)
  const resetIn = ttl >= 0 ? ttl : windowSec
  return { allowed, remaining: Math.max(0, limit - count), resetIn }
}
