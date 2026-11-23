import { clearHouseholdKey } from './keyStore.js'
import { redirectToLogin } from './session.js'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function handleExpiredSession() {
  await clearHouseholdKey()
  return redirectToLogin()
}

function getAuthHeader() {
  const accessToken = sessionStorage.getItem('accessToken')
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

function getCsrfCookieValue() {
  const match = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

function getCsrfHeader() {
  const csrfToken = sessionStorage.getItem('csrfToken') ?? getCsrfCookieValue()
  return csrfToken ? { 'x-csrf-token': csrfToken } : {}
}

function getAdminModeHeader() {
  const adminModeToken = sessionStorage.getItem('adminModeToken')
  return adminModeToken ? { 'x-admin-mode-token': adminModeToken } : {}
}

function storeSession(data) {
  sessionStorage.setItem('accessToken', data.accessToken)
  if (data.csrfToken) sessionStorage.setItem('csrfToken', data.csrfToken)
  if (data.user?.email) sessionStorage.setItem('userEmail', data.user.email)
  if (data.user?.is_super_admin) {
    sessionStorage.setItem('isSuperAdmin', 'true')
  } else {
    sessionStorage.removeItem('isSuperAdmin')
  }
}

async function send(path, options) {
  const { headers: optionHeaders, ...restOptions } = options
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...optionHeaders },
    credentials: 'include',
    ...restOptions,
  })
  const body = await res.json().catch(() => ({}))
  return { res, body }
}

// Access tokens live 15 minutes; the refresh cookie lives 30 days. Several
// requests often expire together (a page loads kids, chores and requests in
// parallel), so they share one in-flight refresh rather than each rotating
// the refresh token and racing each other.
let refreshInFlight = null

function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = send('/auth/refresh', {
      method: 'POST',
      headers: getCsrfHeader(),
    })
      .then(({ res, body }) => {
        if (!res.ok || !body?.accessToken) return false
        storeSession(body)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

function toError(res, body) {
  const message =
    typeof body?.error === 'string'
      ? body.error
      : body?.error?.formErrors?.[0] ??
        Object.values(body?.error?.fieldErrors ?? {}).flat()[0] ??
        `Request failed with status ${res.status}`
  const err = new Error(message)
  err.status = res.status
  return err
}

async function request(path, options = {}) {
  // Only requests sent with a bearer token can be rescued by a refresh;
  // login/register/refresh/logout surface their 401s to the caller as-is.
  const usesAccessToken = Boolean(options.headers?.Authorization)

  let { res, body } = await send(path, options)

  if (res.status === 401 && usesAccessToken) {
    const refreshed = await refreshAccessToken()
    if (!refreshed) return handleExpiredSession()

    // Re-read the Authorization header so the retry carries the new token.
    ;({ res, body } = await send(path, {
      ...options,
      headers: { ...options.headers, ...getAuthHeader() },
    }))
    if (res.status === 401) return handleExpiredSession()
  }

  if (!res.ok) throw toError(res, body)

  return body
}

export const api = {
  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  login: (payload) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  refresh: () =>
    request('/auth/refresh', {
      method: 'POST',
      headers: getCsrfHeader(),
    }),
  logout: () =>
    request('/auth/logout', {
      method: 'POST',
      headers: getCsrfHeader(),
    }),
  getHousehold: () =>
    request('/household', {
      headers: getAuthHeader(),
    }),
  updateHousehold: (payload) =>
    request('/household', {
      method: 'PATCH',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    }),
  enterAdminMode: (payload) =>
    request('/admin/enter', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    }),
  exitAdminMode: () =>
    request('/admin/exit', {
      method: 'POST',
      headers: getAuthHeader(),
    }),
  getKids: () =>
    request('/kids', {
      headers: getAuthHeader(),
    }),
  createKid: (payload) =>
    request('/kids', {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
      body: JSON.stringify(payload),
    }),
  updateKid: (id, payload) =>
    request(`/kids/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
      body: JSON.stringify(payload),
    }),
  deleteKid: (id) =>
    request(`/kids/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  getChores: () =>
    request('/chores', {
      headers: getAuthHeader(),
    }),
  createChore: (payload) =>
    request('/chores', {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
      body: JSON.stringify(payload),
    }),
  updateChore: (id, payload) =>
    request(`/chores/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
      body: JSON.stringify(payload),
    }),
  deleteChore: (id) =>
    request(`/chores/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  overrideChoreAvailability: (id) =>
    request(`/chores/${id}/override-availability`, {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  skipChoreOccurrence: (id) =>
    request(`/chores/${id}/skip`, {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  completeChore: (id, payload) =>
    request(`/chores/${id}/complete`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    }),
  createChoreRequest: (payload) =>
    request('/chore-requests', {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
    }),
  getChoreRequests: ({ status = 'pending', kidId } = {}) =>
    request(
      `/chore-requests?status=${status}${kidId ? `&kid_id=${kidId}` : ''}`,
      { headers: getAuthHeader() },
    ),
  approveChoreRequest: (id, payload = {}) =>
    request(`/chore-requests/${id}/approve`, {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
      body: JSON.stringify(payload),
    }),
  rejectChoreRequest: (id) =>
    request(`/chore-requests/${id}/reject`, {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  createPayout: (payload) =>
    request('/payouts', {
      method: 'POST',
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
      body: JSON.stringify(payload),
    }),
  getPayout: (id) =>
    request(`/payouts/${id}`, {
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  getSuperAdminHouseholds: () =>
    request('/super-admin/households', {
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  getKidHistory: (kidId, { limit = 20, cursor } = {}) =>
    request(
      `/kids/${kidId}/history?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { headers: getAuthHeader() },
    ),
  getShopCatalog: () =>
    request('/shop/catalog', { headers: getAuthHeader() }),
  getKidShop: (kidId) =>
    request(`/shop/kids/${kidId}`, { headers: getAuthHeader() }),
  buyShopItem: (kidId, itemId) =>
    request(`/shop/kids/${kidId}/purchases`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify({ item_id: itemId }),
    }),
  setShopItemEquipped: (kidId, itemId, equipped) =>
    request(`/shop/kids/${kidId}/equipped`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: JSON.stringify({ item_id: itemId, equipped }),
    }),
}

// sessionStorage is cleared when the tab/browser closes, but the httpOnly
// refreshToken cookie (and its readable csrfToken double-submit cookie)
// survive for 30 days. On a fresh tab, re-derive a session from that cookie
// before falling back to the login page.
export async function bootstrapSession() {
  if (sessionStorage.getItem('accessToken')) return true
  if (!getCsrfCookieValue()) return false

  try {
    const data = await api.refresh()
    storeSession(data)
    return true
  } catch {
    return false
  }
}
