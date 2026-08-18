import { clearHouseholdKey } from './keyStore.js'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function handleExpiredSession() {
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('csrfToken')
  sessionStorage.removeItem('adminModeToken')
  sessionStorage.removeItem('userEmail')
  clearHouseholdKey()
  window.location.replace('/login')
}

function shouldRedirectToLogin(path) {
  if (path === '/auth/login' || path === '/auth/register') {
    return false
  }
  return Boolean(sessionStorage.getItem('accessToken'))
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

async function request(path, options = {}) {
  const { headers: optionHeaders, ...restOptions } = options
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...optionHeaders },
    credentials: 'include',
    ...restOptions,
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401 && shouldRedirectToLogin(path)) {
      handleExpiredSession()
    }

    const message =
      typeof body?.error === 'string'
        ? body.error
        : body?.error?.formErrors?.[0] ??
          Object.values(body?.error?.fieldErrors ?? {}).flat()[0] ??
          `Request failed with status ${res.status}`
    const err = new Error(message)
    err.status = res.status
    throw err
  }

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
  completeChore: (id, payload) =>
    request(`/chores/${id}/complete`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: JSON.stringify(payload),
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
  getKidHistory: (kidId, { limit = 20, cursor } = {}) =>
    request(
      `/kids/${kidId}/history?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { headers: getAuthHeader() },
    ),
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
    sessionStorage.setItem('accessToken', data.accessToken)
    if (data.csrfToken) sessionStorage.setItem('csrfToken', data.csrfToken)
    if (data.user?.email) sessionStorage.setItem('userEmail', data.user.email)
    return true
  } catch {
    return false
  }
}
