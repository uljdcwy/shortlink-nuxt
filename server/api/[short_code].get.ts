import { redis } from '~/server/utils/redis'
const r = redis()

export default defineEventHandler( async (event) => {
  const { short_code } = event.context.params as { short_code: string }
  if (!/^[0-9A-Za-z]{6,8}$/.test(short_code)) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const url = await r.get(`sl:${short_code}`)
  if (!url) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  setResponseStatus(event, 302, 'Found')
  setResponseHeader(event, 'Location', url)
  return 'Redirecting...'
})
