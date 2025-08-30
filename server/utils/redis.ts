import Redis from 'ioredis'
import { useRuntimeConfig } from '#imports'

let _client: Redis | null = null

export function redis(): Redis {
  if (_client) return _client
  const { redisUrl } = useRuntimeConfig()
  _client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableReadyCheck: true
  })
  return _client
}
