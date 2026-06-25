import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import styles from '../App.module.css'

const AVATARS = [
  { id: 'corgi-1',  label: 'Corgi #1'  },
  { id: 'corgi-2',  label: 'Corgi #2'  },
  { id: 'corgi-3',  label: 'Corgi #3'  },
  { id: 'corgi-4',  label: 'Corgi #4'  },
  { id: 'corgi-5',  label: 'Corgi #5'  },
  { id: 'corgi-6',  label: 'Corgi #6'  },
  { id: 'corgi-7',  label: 'Corgi #7'  },
  { id: 'corgi-8',  label: 'Corgi #8'  },
  { id: 'corgi-9',  label: 'Corgi #9'  },
  { id: 'corgi-10', label: 'Corgi #10' },
  { id: 'corgi-11', label: 'Corgi #11' },
  { id: 'corgi-12', label: 'Corgi #12' },
]

export default function Admin() {
  const userEmail = sessionStorage.getItem('userEmail')
  const [pin, setPin] = useState('')
  const [kidName, setKidName] = useState('')
  const [avatarId, setAvatarId] = useState('corgi-1')
  const [status, setStatus] = useState('')

  if (!userEmail) return <Navigate to="/login" replace />

  const adminModeToken = sessionStorage.getItem('adminModeToken')

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

  async function handleCreateKid(e) {
    e.preventDefault()
    setStatus('')
    try {
      await api.createKid({ enc_display_name: kidName, avatar_id: avatarId })
      setKidName('')
      setAvatarId('corgi-1')
      setStatus('Kid profile created.')
    } catch (err) {
      setStatus(err.message ?? 'Unable to create kid profile.')
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.appHeader}>
        <h1 className={styles.appTitle}>🐾 Chorgie</h1>
        <div className={styles.topActions}>
          <Link to="/" className={styles.btnGhost}>← Back to home</Link>
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
              <Link to="/history" className={`${styles.btn} ${styles.btnSecondary}`}>
                Payment history
              </Link>
              <button
                type="button"
                onClick={handleExitAdminMode}
                className={`${styles.btn} ${styles.btnGhost}`}
              >
                Exit Admin Mode
              </button>
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
                <label id="avatar-picker-label">Avatar</label>
                <div className={styles.avatarPicker} aria-labelledby="avatar-picker-label">
                  {AVATARS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAvatarId(id)}
                      className={`${styles.avatarOption}${avatarId === id ? ` ${styles.avatarOptionSelected}` : ''}`}
                      title={label}
                      aria-pressed={avatarId === id}
                    >
                      <img src={`/avatars/${id}.png`} alt={label} />
                    </button>
                  ))}
                </div>
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
    </main>
  )
}
