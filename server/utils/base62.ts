const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function toBase62(buffer: Uint8Array): string {
  // Convert arbitrary bytes to a base62 string
  // Implementation: interpret as big integer in base256 -> base62
  let num = 0n
  for (const b of buffer) {
    num = (num << 8n) + BigInt(b)
  }
  if (num === 0n) return '0'
  const base = BigInt(alphabet.length)
  let out = ''
  while (num > 0n) {
    const rem = Number(num % base)
    out = alphabet[rem] + out
    num = num / base
  }
  return out
}

export function clampCode(s: string, length = 7): string {
  if (s.length === length) return s
  if (s.length > length) return s.slice(0, length)
  // pad with leading zeros if too short
  return s.padStart(length, '0')
}
