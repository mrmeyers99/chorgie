import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import styles from './Login.module.css'

export default function Login() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const userEmail = sessionStorage.getItem('userEmail')
  if (userEmail) {
    return <Navigate to="/" replace />
  }

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await api.login({
        email: form.email,
        password: form.password,
      })
      sessionStorage.setItem('accessToken', data.accessToken)
      if (data.csrfToken) {
        sessionStorage.setItem('csrfToken', data.csrfToken)
      }
      sessionStorage.setItem('userEmail', data.user.email)
      navigate('/')
    } catch (err) {
      setError(err.message ?? 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Log in to Chorgie</h1>
        <p className={styles.subtitle}>
          Enter your account details to continue to your household.
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
              autoComplete="current-password"
              required
              value={form.password}
              onChange={handleChange}
            />
          </div>

          <button type="submit" disabled={loading} className={styles.submit}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className={styles.footer}>
          Need an account? <Link to="/register">Create your household</Link>
        </p>
      </div>
    </main>
  )
}
