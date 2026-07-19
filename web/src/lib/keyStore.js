/**
 * Persists the household encryption key (a non-extractable CryptoKey) in
 * IndexedDB so it survives a page reload within the same browser/tab, since
 * kids use the same already-logged-in session as the admin with no login of
 * their own. A module-level cache avoids re-reading IndexedDB on every call.
 *
 * IndexedDB can store a non-extractable CryptoKey directly via structured
 * clone — no raw key material is ever exposed to JS.
 */

const DB_NAME = 'chorgie-keystore'
const DB_VERSION = 1
const STORE_NAME = 'keys'
const KEY_ID = 'householdKey'

let cachedKey = null

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore(mode, run) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const store = tx.objectStore(STORE_NAME)
      const request = run(store)
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function setHouseholdKey(key) {
  cachedKey = key
  try {
    await withStore('readwrite', (store) => store.put(key, KEY_ID))
  } catch (err) {
    console.warn('Failed to persist household key to IndexedDB', err)
  }
}

export async function getHouseholdKey() {
  if (cachedKey) return cachedKey

  try {
    const key = await withStore('readonly', (store) => store.get(KEY_ID))
    cachedKey = key ?? null
    return cachedKey
  } catch (err) {
    console.warn('Failed to read household key from IndexedDB', err)
    return null
  }
}

export async function clearHouseholdKey() {
  cachedKey = null
  try {
    await withStore('readwrite', (store) => store.delete(KEY_ID))
  } catch (err) {
    console.warn('Failed to clear household key from IndexedDB', err)
  }
}

/**
 * Returns the household key, or forces a fresh login if the session looks
 * valid (an access token is present) but the key can't be recovered — the
 * only way to re-derive it is re-entering the password.
 */
export async function requireHouseholdKey() {
  const key = await getHouseholdKey()
  if (key) return key

  await clearHouseholdKey()
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('csrfToken')
  sessionStorage.removeItem('adminModeToken')
  sessionStorage.removeItem('userEmail')
  window.location.replace('/login')
  return null
}
