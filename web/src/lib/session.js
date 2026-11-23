const SESSION_KEYS = [
  'accessToken',
  'csrfToken',
  'adminModeToken',
  'userEmail',
  'isSuperAdmin',
]

let redirectingToLogin = false

export function clearSessionStorage() {
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key)
}

/**
 * Ends the session and hard-redirects to /login, exactly once.
 *
 * window.location.replace() only schedules the navigation — JS keeps running
 * until the browser actually unloads the page. If callers were allowed to
 * carry on (throwing errors into catch blocks, setting state), pages would
 * re-render against the now-empty sessionStorage and flash error messages,
 * the Landing page or an in-app <Navigate to="/login"> before the reload
 * lands. So this returns a promise that never settles: awaiting callers just
 * stop where they are until the page goes away.
 */
export function redirectToLogin() {
  if (!redirectingToLogin) {
    redirectingToLogin = true
    clearSessionStorage()
    window.location.replace('/login')
  }
  return new Promise(() => {})
}
