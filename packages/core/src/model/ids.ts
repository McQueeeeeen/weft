const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * 12 random base-36 characters (~62 bits). `crypto.randomUUID` is avoided on purpose:
 * it only exists in secure contexts, and the board should also work when opened over
 * plain http on a local network.
 */
export function createId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  let id = ''
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return id
}
