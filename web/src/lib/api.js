const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

function getAuthHeader() {
  const accessToken = sessionStorage.getItem('accessToken')
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

function getCsrfHeader() {
  const csrfToken = sessionStorage.getItem('csrfToken')
  return csrfToken ? { 'x-csrf-token': csrfToken } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
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
}
