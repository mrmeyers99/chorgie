import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import styles from './AdminLayout.module.css'

export default function AdminLayout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [adminModeToken, setAdminModeToken] = useState(() => sessionStorage.getItem('adminModeToken'))
  const [pin, setPin] = useState('')
  const [pinStatus, setPinStatus] = useState('')

  async function handleEnterAdminMode(e) {
    e.preventDefault()
    setPinStatus('')
    const normalizedPin = pin.replace(/\D/g, '')
    if (!/^\d{4,8}$/.test(normalizedPin)) {
      setPinStatus('PIN must be 4-8 digits.')
      return
    }
    try {
      const data = await api.enterAdminMode({ pin: normalizedPin })
      sessionStorage.setItem('adminModeToken', data.adminModeToken)
      setAdminModeToken(data.adminModeToken)
      setPin('')
    } catch (err) {
      setPinStatus(err.message ?? 'Unable to enter admin mode.')
    }
  }

  async function handleExitAdmin(e) {
    e.preventDefault()
    await api.exitAdminMode().catch(() => null)
    sessionStorage.removeItem('adminModeToken')
    setAdminModeToken(null)
    navigate('/')
  }

  const isFamily = location.pathname === '/admin'
  const isChores = location.pathname === '/chores'

  if (!adminModeToken) {
    return (
      <div className={styles.pinGate}>
        <form onSubmit={handleEnterAdminMode} className={styles.pinForm} noValidate>
          <Link to="/" className={styles.navLogo}>🐾 Chorgie</Link>
          <h1 className={styles.pinTitle}>Admin Mode</h1>
          <div className={styles.pinRow}>
            <label htmlFor="pin">Enter admin PIN</label>
            <input
              id="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              pattern="[0-9]{4,8}"
              minLength={4}
              maxLength={8}
              placeholder="4–8 digit PIN"
              autoFocus
              required
            />
          </div>
          {pinStatus ? <p className={styles.pinStatus}>{pinStatus}</p> : null}
          <button type="submit" className={styles.pinSubmit}>Enter Admin Mode</button>
        </form>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <nav className={styles.sideNav} aria-label="Admin navigation">
        <div className={styles.navTop}>
          <Link to="/" className={styles.navLogo}>🐾 Chorgie</Link>
          <span className={styles.adminBadge}>Admin</span>
        </div>

        <ul className={styles.navList}>
          <li>
            <Link
              to="/admin"
              className={`${styles.navLink}${isFamily ? ` ${styles.navLinkActive}` : ''}`}
            >
              Family
            </Link>
          </li>
          <li>
            <Link
              to="/chores"
              className={`${styles.navLink}${isChores ? ` ${styles.navLinkActive}` : ''}`}
            >
              Chores
            </Link>
          </li>
        </ul>

        <div className={styles.navBottom}>
          <button type="button" onClick={handleExitAdmin} className={styles.exitBtn}>
            Exit Admin
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
