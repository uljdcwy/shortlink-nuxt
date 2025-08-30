export function assertValidUrl(u: string): URL {
  let parsed: URL
  try {
    parsed = new URL(u)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid URL format' })
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    throw createError({ statusCode: 400, statusMessage: 'Only http/https URLs are allowed' })
  }
  if (!parsed.hostname) {
    throw createError({ statusCode: 400, statusMessage: 'URL must include a hostname' })
  }
  // Optional: prevent SSRF to localhost/meta
  const host = parsed.hostname.toLowerCase()
  if (['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw createError({ statusCode: 400, statusMessage: 'Localhost URLs are not allowed' })
  }
  return parsed
}

export function clientIp(event: any): string {
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return event.node.req.socket.remoteAddress || 'unknown'
}
