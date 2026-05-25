import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import { api } from './lib/api.js'

function Home() {
  const userEmail = sessionStorage.getItem('userEmail')
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState('')
  const [kids, setKids] = useState([])
  const [kidName, setKidName] = useState('')
  const [avatarId, setAvatarId] = useState('corgi-1')
  const [loadingKids, setLoadingKids] = useState(false)

  if (!userEmail) {
    return <Navigate to="/login" replace />
  }

  const adminModeToken = sessionStorage.getItem('adminModeToken')

  async function loadKids() {
    setLoadingKids(true)
    try {
      const data = await api.getKids()
      setKids(data.kids ?? [])
    } catch (err) {
      setStatus(err.message ?? 'Failed to load kid profiles.')
    } finally {
      setLoadingKids(false)
    }
  }

  async function handleEnterAdminMode(e) {
    e.preventDefault()
    setStatus('')
    try {
      const data = await api.enterAdminMode({ pin })
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

  return (
    <section style={{ padding: '40px 24px', textAlign: 'center' }}>
      <h1>Chorgie</h1>
      <p>Welcome, {userEmail}!</p>
      {status ? <p role="status">{status}</p> : null}

      {!adminModeToken ? (
        <form onSubmit={handleEnterAdminMode} style={{ marginTop: 16 }}>
          <label htmlFor="pin">Enter admin PIN</label>
          <br />
          <input
            id="pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            required
          />
          <button type="submit" style={{ marginLeft: 8 }}>
            Enter Admin Mode
          </button>
        </form>
      ) : (
        <form onSubmit={handleCreateKid} style={{ marginTop: 16 }}>
          <h2>Add kid profile</h2>
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
        <button type="button" onClick={() => void loadKids()}>
          Refresh kid profiles
        </button>
        {loadingKids ? (
          <p>Loading kids…</p>
        ) : kids.length ? (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {kids.map((kid) => (
              <li key={kid.id}>
                {kid.enc_display_name} ({kid.avatar_id})
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
