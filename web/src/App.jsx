import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import ChoreAdmin from './pages/ChoreAdmin.jsx'
import { api } from './lib/api.js'
import styles from './App.module.css'

const AVATAR_EMOJI = {
  'corgi-1': '🐕',
  'corgi-2': '🐶',
  'corgi-3': '🦮',
  'corgi-4': '🐾',
}

function Home() {
  const navigate = useNavigate()
  const userEmail = sessionStorage.getItem('userEmail')
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState('')
  const [kids, setKids] = useState([])
  const [kidName, setKidName] = useState('')
  const [avatarId, setAvatarId] = useState('corgi-1')
  const [loadingKids, setLoadingKids] = useState(false)

  useEffect(() => {
    void loadKids()
  }, [])

  if (!userEmail) {
    return <Navigate to="/login" replace />
  }

  const adminModeToken = sessionStorage.getItem('adminModeToken')

  async function loadKids() {
    setLoadingKids(true)
    try {
      const data = await api.getKids()
      setKids((data.kids ?? []).filter((kid) => kid.is_active !== false))
    } catch (err) {
      setStatus(err.message ?? 'Failed to load kid profiles.')
    } finally {
      setLoadingKids(false)
    }
  }

  async function handleEnterAdminMode(e) {
    e.preventDefault()
    setStatus('')
    const normalizedPin = pin.replace(/\D/g, '')
    if (!/^\d{4,8}$/.test(normalizedPin)) {
      setStatus('PIN must be 4-8 digits.')
      return
    }
    try {
      const data = await api.enterAdminMode({ pin: normalizedPin })
      sessionStorage.setItem('adminModeToken', data.adminModeToken)
      setStatus(`Admin mode enabled for ${data.expiresInSeconds} seconds.`)
      setPin('')
    } catch (err) {
      setStatus(err.message ?? 'Unable to enter admin mode.')
    }
  }

  async function handleCreateKid(e) {
    e.preventDefault()
    setStatus('')
    try {
      await api.createKid({
        enc_display_name: kidName,
        avatar_id: avatarId,
      })
      setKidName('')
      await loadKids()
      setStatus('Kid profile created.')
    } catch (err) {
      setStatus(err.message ?? 'Unable to create kid profile.')
    }
  }

  async function handleDeleteKid(id) {
    setStatus('')
    try {
      await api.deleteKid(id)
      setStatus('Kid deactivated.')
      await loadKids()
    } catch (err) {
      setStatus(err.message ?? 'Failed to deactivate kid.')
    }
  }

  async function handleExitAdminMode(e) {
    e.preventDefault()
    setStatus('')
    try {
      await api.exitAdminMode()
      sessionStorage.removeItem('adminModeToken')
      setStatus('Admin mode disabled.')
    } catch (err) {
      setStatus(err.message ?? 'Unable to exit admin mode.')
    }
  }

  async function handleLogout(e) {
    e.preventDefault()
    await api.logout().catch(() => null)
    sessionStorage.removeItem('accessToken')
    sessionStorage.removeItem('csrfToken')
    sessionStorage.removeItem('adminModeToken')
    sessionStorage.removeItem('userEmail')
    navigate('/login', { replace: true })
  }

  return (
    <main className={styles.page}>
      <header className={styles.appHeader}>
        <h1 className={styles.appTitle}>🐾 Chorgie</h1>
        <div className={styles.topActions}>
          <span className={styles.appSubtitle}>Welcome, {userEmail}</span>
          <a href="/login" onClick={handleLogout} className={styles.btnGhost}>
            Log out
          </a>
        </div>
      </header>

      {status ? <p role="status" className={styles.statusMsg}>{status}</p> : null}

      <div className={styles.adminCard}>
        {!adminModeToken ? (
          <form onSubmit={handleEnterAdminMode} noValidate>
            <h2>Admin Mode</h2>
            <div className={styles.formRow}>
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
                required
              />
            </div>
            <div className={styles.formActions}>
              <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
                Enter Admin Mode
              </button>
            </div>
          </form>
        ) : (
          <>
            <h2>Admin Mode Active 🔓</h2>
            <div className={styles.adminLinks}>
              <Link to="/chores" className={`${styles.btn} ${styles.btnSecondary}`}>
                Manage chores
              </Link>
              <a
                href="/#exit-admin-mode"
                onClick={handleExitAdminMode}
                className={`${styles.btn} ${styles.btnGhost}`}
              >
                Exit Admin Mode
              </a>
            </div>

            <form onSubmit={handleCreateKid}>
              <h2>Add kid profile</h2>
              <div className={styles.formRow}>
                <label htmlFor="kidName">Display name</label>
                <input
                  id="kidName"
                  value={kidName}
                  onChange={(e) => setKidName(e.target.value)}
                  placeholder="Kid's name"
                  required
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="avatarId">Avatar</label>
                <select
                  id="avatarId"
                  value={avatarId}
                  onChange={(e) => setAvatarId(e.target.value)}
                >
                  <option value="corgi-1">🐕 Corgi 1</option>
                  <option value="corgi-2">🐶 Corgi 2</option>
                  <option value="corgi-3">🦮 Corgi 3</option>
                  <option value="corgi-4">🐾 Corgi 4</option>
                </select>
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Add Kid
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      <div>
        <p className={styles.sectionTitle}>
          {kids.length ? 'Who are you?' : 'Kid Profiles'}
        </p>
        {loadingKids ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : kids.length ? (
          <ul className={styles.kidGrid}>
            {kids.map((kid) => (
              <li key={kid.id} className={styles.kidCard}>
                <span className={styles.kidAvatar}>
                  {AVATAR_EMOJI[kid.avatar_id] ?? '🐾'}
                </span>
                <span className={styles.kidName}>{kid.enc_display_name}</span>
                {adminModeToken && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteKid(kid.id)}
                    className={`${styles.btn} ${styles.btnDanger}`}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyState}>
            No kid profiles yet. Enter admin mode to add one.
          </p>
        )}
      </div>
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/chores" element={<ChoreAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
