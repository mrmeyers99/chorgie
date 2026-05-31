import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import ChoreAdmin from './pages/ChoreAdmin.jsx'
import { api } from './lib/api.js'

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
    <section style={{ padding: '40px 24px', textAlign: 'center' }}>
      <h1>Chorgie</h1>
      <p>Welcome, {userEmail}!</p>
      <p>
        <a href="/login" onClick={handleLogout}>
          Log out
        </a>
      </p>
      {status ? <p role="status">{status}</p> : null}

      {!adminModeToken ? (
        <form onSubmit={handleEnterAdminMode} noValidate style={{ marginTop: 16 }}>
          <label htmlFor="pin">Enter admin PIN</label>
          <br />
          <input
            id="pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            minLength={4}
            maxLength={8}
            required
          />
          <button type="submit" style={{ marginLeft: 8 }}>
            Enter Admin Mode
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreateKid} style={{ marginTop: 16 }}>
          <h2>Add kid profile</h2>
          <p>
            <Link to="/chores">Manage chores</Link>
          </p>
          <p>
            <a href="/#exit-admin-mode" onClick={handleExitAdminMode}>
              Exit Admin Mode
            </a>
          </p>
          <div>
            <input
              value={kidName}
              onChange={(e) => setKidName(e.target.value)}
              placeholder="Kid display name"
              required
            />
          </div>
          <div style={{ marginTop: 8 }}>
            <select value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
              <option value="corgi-1">Corgi 1</option>
              <option value="corgi-2">Corgi 2</option>
              <option value="corgi-3">Corgi 3</option>
              <option value="corgi-4">Corgi 4</option>
            </select>
            <button type="submit" style={{ marginLeft: 8 }}>
              Add Kid
            </button>
          </div>
        </form>
      )}

      <div style={{ marginTop: 24 }}>
        <h2>Kid profiles</h2>
        {loadingKids ? (
          <p>Loading kids…</p>
        ) : kids.length ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {kids.map((kid) => (
              <li key={kid.id}>
                {kid.enc_display_name} ({kid.avatar_id})
                {adminModeToken && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteKid(kid.id)}
                    style={{ marginLeft: 8 }}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>No kid profiles yet.</p>
        )}
      </div>
    </section>
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
