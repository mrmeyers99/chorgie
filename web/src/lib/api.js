const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function handleExpiredSession() {
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('csrfToken')
  sessionStorage.removeItem('adminModeToken')
  sessionStorage.removeItem('userEmail')
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

function getCsrfHeader() {
  const csrfToken = sessionStorage.getItem('csrfToken')
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
  getPayouts: (kidId) =>
    request(`/payouts${kidId ? `?kid_id=${kidId}` : ''}`, {
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  getPayout: (id) =>
    request(`/payouts/${id}`, {
      headers: { ...getAuthHeader(), ...getAdminModeHeader() },
    }),
  getKidCompletions: (kidId) =>
    request(`/kids/${kidId}/completions`, {
      headers: getAuthHeader(),
    }),
}
