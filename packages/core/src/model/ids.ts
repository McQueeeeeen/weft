const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function createId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let id = ''
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return id
}
