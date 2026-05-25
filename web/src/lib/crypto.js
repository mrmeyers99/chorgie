/**
 * Derives a household encryption key (HEK) from the user's password using PBKDF2,
 * and generates a random enc_salt to send to the server.
 *
 * Returns { encSalt, hek } where:
 *   - encSalt is a base64-encoded random salt (stored server-side)
 *   - hek is the derived CryptoKey (held only in memory)
 */
export async function deriveHouseholdKey(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(32))
  const encSalt = btoa(String.fromCharCode(...saltBytes))

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const hek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 310_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  return { encSalt, hek }
}
