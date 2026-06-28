import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import ChoreAdmin from './pages/ChoreAdmin.jsx'
import PaymentHistory from './pages/PaymentHistory.jsx'
import AdminFamily from './pages/AdminFamily.jsx'
import { api } from './lib/api.js'
import styles from './App.module.css'


function Home() {
  const navigate = useNavigate()
  const userEmail = sessionStorage.getItem('userEmail')
  const [pin, setPin] = useState('')
  const [status, setStatus] = useState('')
  const [kids, setKids] = useState([])
  const [loadingKids, setLoadingKids] = useState(false)
  const [chores, setChores] = useState([])
  const [loadingChores, setLoadingChores] = useState(false)
  const [selectedKidId, setSelectedKidId] = useState('')
  const [completingChoreId, setCompletingChoreId] = useState('')

  useEffect(() => {
    void loadKids()
    void loadChores()
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

  async function loadChores() {
    setLoadingChores(true)
    try {
      const data = await api.getChores()
      setChores(data.chores ?? [])
    } catch (err) {
      setStatus(err.message ?? 'Failed to load chores.')
    } finally {
      setLoadingChores(false)
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
      setPin('')
      navigate('/admin')
    } catch (err) {
      setStatus(err.message ?? 'Unable to enter admin mode.')
    }
  }

  function handleKidSelect(id) {
    setSelectedKidId(id)
  }

  async function handleCompleteChore(choreId) {
    if (!selectedKid) return
    setStatus('')
    setCompletingChoreId(choreId)
    try {
      const data = await api.completeChore(choreId, { kid_id: selectedKid.id })
      await Promise.all([loadChores(), loadKids()])
      const reward = Number(data.reward_amount)
      setStatus(
        Number.isFinite(reward)
          ? `${selectedKid.enc_display_name} earned $${reward.toFixed(2)}!`
          : 'Chore completed.'
      )
    } catch (err) {
      setStatus(err.message ?? 'Failed to complete chore.')
    } finally {
      setCompletingChoreId('')
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

  const selectedKid = kids.find((kid) => kid.id === selectedKidId && kid.is_active !== false)
  const visibleChores = selectedKid
    ? chores.filter((chore) => {
        if (chore.is_active === false) {
          return false
        }
        if (chore.is_available === false) {
          return false
        }
        const eligibleKids = Array.isArray(chore.eligible_kids) ? chore.eligible_kids : []
        return eligibleKids.length === 0 || eligibleKids.includes(selectedKid.id)
      })
    : []

  // Upcoming chores: completion-based chores that are not yet available but will be soon
  const upcomingChores = selectedKid
    ? chores.filter((chore) => {
        if (chore.is_active === false) {
          return false
        }
        if (chore.recurrence_type !== 'completion-based') {
          return false
        }
        if (chore.is_available === true) {
          return false
        }
        const eligibleKids = Array.isArray(chore.eligible_kids) ? chore.eligible_kids : []
        return eligibleKids.length === 0 || eligibleKids.includes(selectedKid.id)
      }).sort((a, b) => {
        // Sort by next_available_at, showing soonest first
        if (!a.next_available_at && !b.next_available_at) return 0
        if (!a.next_available_at) return 1
        if (!b.next_available_at) return -1
        return new Date(a.next_available_at).getTime() - new Date(b.next_available_at).getTime()
      })
    : []

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
          <div className={styles.adminLinks}>
            <Link to="/admin" className={`${styles.btn} ${styles.btnSecondary}`}>
              Admin Area
            </Link>
          </div>
        )}
      </div>

      <div>
        <p className={styles.sectionTitle}>Your Family</p>
        {loadingKids ? (
          <p className={styles.emptyState}>Loading…</p>
        ) : kids.length ? (
          <ul className={styles.kidGrid}>
            {kids.map((kid) => (
              <li key={kid.id} className={styles.kidCard}>
                <button
                  type="button"
                  onClick={() => handleKidSelect(kid.id)}
                  className={`${styles.kidSelectBtn}${selectedKidId === kid.id ? ` ${styles.kidSelectBtnActive}` : ''}`}
                >
                  <img
                    src={`/avatars/${kid.avatar_id}.png`}
                    alt={`${kid.enc_display_name}'s avatar`}
                    className={styles.kidAvatar}
                    onError={(e) => { e.currentTarget.src = '/avatars/corgi-1.png' }}
                  />
                  <span className={styles.kidName}>{kid.enc_display_name}</span>
                  <span className={styles.kidBalance}>${Number(kid.balance ?? 0).toFixed(2)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyState}>
            No kid profiles yet. Enter admin mode to add one.
          </p>
        )}
      </div>

      {selectedKid ? (
        <div className={styles.choresCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <p className={styles.sectionTitle}>Chores for {selectedKid.enc_display_name}</p>
              <p className={styles.balanceLine}>Balance: ${Number(selectedKid.balance ?? 0).toFixed(2)}</p>
            </div>
            <Link to={`/history?kid=${selectedKid.id}`} className={`${styles.btn} ${styles.btnSecondary}`}>
              View History
            </Link>
          </div>
          {loadingChores ? (
            <p className={styles.emptyState}>Loading chores…</p>
          ) : visibleChores.length ? (
            <>
              <ul className={styles.choreList}>
                {visibleChores.map((chore) => (
                  <li key={chore.id} className={styles.choreItem}>
                    <span className={styles.choreName}>{chore.enc_name}</span>
                    <span className={styles.choreMeta}>${chore.reward_amount}</span>
                    <button
                      type="button"
                      onClick={() => void handleCompleteChore(chore.id)}
                      className={`${styles.btn} ${styles.btnPrimary}`}
                      disabled={completingChoreId === chore.id}
                    >
                      {completingChoreId === chore.id ? 'Completing…' : 'Complete'}
                    </button>
                  </li>
                ))}
              </ul>
              {upcomingChores.length > 0 && (
                <>
                  <p className={styles.sectionTitle} style={{ marginTop: '24px' }}>Upcoming Chores</p>
                  <ul className={styles.choreList}>
                    {upcomingChores.map((chore) => (
                      <li key={chore.id} className={`${styles.choreItem} ${styles.choreItemDisabled}`}>
                        <span className={styles.choreName}>{chore.enc_name}</span>
                        <span className={styles.choreMeta}>
                          ${chore.reward_amount}
                          {chore.next_available_at && (
                            <span style={{ marginLeft: '8px', fontSize: '0.85em' }}>
                              (Available {new Date(chore.next_available_at).toLocaleDateString()})
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnPrimary}`}
                          disabled
                        >
                          Not Yet
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className={styles.emptyState}>No chores are available right now.</p>
          )}
        </div>
      ) : null}

    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin" element={<AdminFamily />} />
      <Route path="/chores" element={<ChoreAdmin />} />
      <Route path="/history" element={<PaymentHistory />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
