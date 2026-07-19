/**
 * Derives a household encryption key (HEK) from the user's password using PBKDF2.
 *
 * If `existingEncSalt` is omitted, a fresh random salt is generated (registration).
 * If provided (base64), that salt is reused instead so the same password
 * re-derives the same key (login).
 *
 * Returns { encSalt, hek } where:
 *   - encSalt is the base64-encoded salt that was used (new or passed-through)
 *   - hek is the derived CryptoKey (non-extractable)
 */
export async function deriveHouseholdKey(password, existingEncSalt) {
  const saltBytes = existingEncSalt
    ? fromBase64(existingEncSalt)
    : crypto.getRandomValues(new Uint8Array(32))
  const encSalt = existingEncSalt ?? toBase64(saltBytes)

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

const IV_LENGTH = 12

/**
 * Encrypts a field value with the household key. Returns a single string:
 * base64(iv || ciphertext+tag). null/undefined/'' pass through unchanged.
 */
export async function encryptField(hek, plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return plaintext
  }

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    hek,
    new TextEncoder().encode(plaintext),
  )

  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return toBase64(combined)
}

/**
 * Decrypts a field value produced by encryptField. Throws on a wrong key or
 * malformed envelope. null/undefined/'' pass through unchanged.
 */
export async function decryptField(hek, envelope) {
  if (envelope === null || envelope === undefined || envelope === '') {
    return envelope
  }

  const combined = fromBase64(envelope)
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, hek, ciphertext)
  return new TextDecoder().decode(plaintext)
}

/**
 * Like decryptField, but never rejects — returns `fallback` for corrupt or
 * undecryptable values so one bad row doesn't break an entire list render.
 */
export async function safeDecryptField(hek, envelope, fallback = '🔒 unreadable') {
  if (envelope === null || envelope === undefined || envelope === '') {
    return envelope
  }

  try {
    return await decryptField(hek, envelope)
  } catch {
    return fallback
  }
}

function toBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function fromBase64(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
