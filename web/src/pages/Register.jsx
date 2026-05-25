import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deriveHouseholdKey } from '../lib/crypto.js'
import { api } from '../lib/api.js'
import styles from './Register.module.css'

const TIMEZONES =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Anchorage',
        'Pacific/Honolulu',
        'Europe/London',
        'Europe/Berlin',
        'Europe/Paris',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Asia/Kolkata',
        'Australia/Sydney',
        'Pacific/Auckland',
      ]
const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar ($)' },
  { code: 'EUR', label: 'EUR — Euro (€)' },
  { code: 'GBP', label: 'GBP — British Pound (£)' },
  { code: 'CAD', label: 'CAD — Canadian Dollar (CA$)' },
  { code: 'AUD', label: 'AUD — Australian Dollar (A$)' },
]

const DEFAULT_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/New_York'

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    admin_pin: '',
    confirmAdminPin: '',
    timezone: DEFAULT_TZ,
    currency_code: 'USD',
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (!/^\d{4,8}$/.test(form.admin_pin)) {
      setError('Admin PIN must be 4 to 8 digits.')
      return
    }
    if (form.admin_pin !== form.confirmAdminPin) {
      setError('Admin PINs do not match.')
      return
    }

    setLoading(true)
    try {
      const { encSalt } = await deriveHouseholdKey(form.password)

      const data = await api.register({
        email: form.email,
        password: form.password,
        admin_pin: form.admin_pin,
        timezone: form.timezone,
        currency_code: form.currency_code,
        enc_salt: encSalt,
      })

      // Store access token in memory via sessionStorage for now
      sessionStorage.setItem('accessToken', data.accessToken)
      if (data.csrfToken) {
        sessionStorage.setItem('csrfToken', data.csrfToken)
      }
      sessionStorage.setItem('userEmail', data.user.email)

      navigate('/')
    } catch (err) {
      setError(err.message ?? 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Create your household</h1>
        <p className={styles.subtitle}>
          Set up Chorgie for your family. You&rsquo;ll be the household admin.
        </p>

        <form onSubmit={handleSubmit} noValidate className={styles.form}>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={form.password}
              onChange={handleChange}
            />
            <small>At least 8 characters</small>
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={form.confirmPassword}
              onChange={handleChange}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="admin_pin">Admin PIN</label>
            <input
              id="admin_pin"
              name="admin_pin"
              type="password"
              autoComplete="new-password"
              inputMode="numeric"
              pattern="\d{4,8}"
              minLength={4}
              maxLength={8}
              required
              value={form.admin_pin}
              onChange={handleChange}
            />
            <small>4 to 8 digits for admin mode</small>
          </div>

          <div className={styles.field}>
            <label htmlFor="confirmAdminPin">Confirm admin PIN</label>
            <input
              id="confirmAdminPin"
              name="confirmAdminPin"
              type="password"
              autoComplete="new-password"
              inputMode="numeric"
              pattern="\d{4,8}"
              minLength={4}
              maxLength={8}
              required
              value={form.confirmAdminPin}
              onChange={handleChange}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="timezone">Household timezone</label>
            <select
              id="timezone"
              name="timezone"
              value={form.timezone}
              onChange={handleChange}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="currency_code">Currency</label>
            <select
              id="currency_code"
              name="currency_code"
              value={form.currency_code}
              onChange={handleChange}
            >
              {CURRENCIES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={loading} className={styles.submit}>
            {loading ? 'Creating household…' : 'Create household'}
          </button>
        </form>
      </div>
    </main>
  )
}
