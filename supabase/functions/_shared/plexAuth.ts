const encoder = new TextEncoder()
const decoder = new TextDecoder()

async function tokenKey() {
  // Use a dedicated secret only — never the service-role key. Reusing it coupled
  // two high-value secrets and would make stored tokens undecryptable the moment
  // the service-role key is rotated.
  const secret = Deno.env.get('PLEX_TOKEN_SECRET')
  if (!secret) throw new Error('PLEX_TOKEN_SECRET is not configured')
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), encoder.encode(token))
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptToken(ciphertext?: string | null, iv?: string | null) {
  if (!ciphertext || !iv) throw new Error('Plex is not connected')
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await tokenKey(),
    base64ToBytes(ciphertext),
  )
  return decoder.decode(decrypted)
}
