import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import Admin from './pages/Admin.jsx'
import ChoreAdmin from './pages/ChoreAdmin.jsx'
import PaymentHistory from './pages/PaymentHistory.jsx'
import { api } from './lib/api.js'
import styles from './App.module.css'

function Home() {
  const navigate = useNavigate()
  const userEmail = sessionStorage.getItem('userEmail')
  const [status, setStatus] = useState('')
  const [kids, setKids] = useState([])
  const [loadingKids, setLoadingKids] = useState(false)
  const [chores, setChores] = useState([])
  const [loadingChores, setLoadingChores] = useState(false)
  const [selectedKidId, setSelectedKidId] = useState('')
  const [completingChoreId, setCompletingChoreId] = useState('')
  const [payoutNotes, setPayoutNotes] = useState('')
  const [showPayoutDialog, setShowPayoutDialog] = useState(false)
  const [payoutKidId, setPayoutKidId] = useState('')

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

  function handleOpenPayoutDialog(kidId) {
    setPayoutKidId(kidId)
    setPayoutNotes('')
    setShowPayoutDialog(true)
  }

  async function handleMarkPaid(e) {
    e.preventDefault()
    setStatus('')
    const kid = kids.find((k) => k.id === payoutKidId)
    if (!kid) return

    try {
      await api.createPayout({
        kid_id: payoutKidId,
        enc_notes: payoutNotes || undefined,
      })
      setStatus(`Marked ${kid.enc_display_name} as paid!`)
      setShowPayoutDialog(false)
      setPayoutNotes('')
      setPayoutKidId('')
      await loadKids()
    } catch (err) {
      setStatus(err.message ?? 'Failed to mark as paid.')
    }
  }

  function handleCancelPayout() {
    setShowPayoutDialog(false)
    setPayoutNotes('')
    setPayoutKidId('')
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
          <Link to="/admin" className={styles.btnGhost}>Admin</Link>
          <a href="/login" onClick={handleLogout} className={styles.btnGhost}>
            Log out
          </a>
        </div>
      </header>

      {status ? <p role="status" className={styles.statusMsg}>{status}</p> : null}

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
                {adminModeToken && (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleDeleteKid(kid.id)}
                      className={`${styles.btn} ${styles.btnDanger}`}
                    >
                      Delete
                    </button>
                    {Number(kid.balance ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => handleOpenPayoutDialog(kid.id)}
                        className={`${styles.btn} ${styles.btnPrimary}`}
                      >
                        Mark Paid
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyState}>
            No kid profiles yet. Visit the <Link to="/admin">Admin page</Link> to add one.
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
          ) : visibleChores.length === 0 && upcomingChores.length === 0 ? (
            <p className={styles.emptyState}>No chores are available right now.</p>
          ) : (
            <>
              {visibleChores.length > 0 && (
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
              )}
              {upcomingChores.length > 0 && (
                <>
                  {visibleChores.length > 0 && (
                    <p className={styles.sectionTitle} style={{ marginTop: '24px' }}>Upcoming Chores</p>
                  )}
                  <ul className={styles.choreList}>
                    {upcomingChores.map((chore) => (
                      <li key={chore.id} className={`${styles.choreItem} ${styles.choreItemDisabled}`}>
                        <span className={styles.choreName}>{chore.enc_name}</span>
                        <span className={styles.choreMeta}>
                          ${chore.reward_amount}
                          {chore.next_available_at && (
                            <span style={{ marginLeft: '8px', fontSize: '0.85em' }}>
                              Available {new Date(chore.next_available_at).toLocaleDateString()}
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
          )}
        </div>
      ) : null}

      {showPayoutDialog && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <form onSubmit={handleMarkPaid}>
              <h2>Mark as Paid</h2>
              <p>
                You are about to mark{' '}
                <strong>{kids.find((k) => k.id === payoutKidId)?.enc_display_name}</strong> as paid.
                Their balance of ${Number(kids.find((k) => k.id === payoutKidId)?.balance ?? 0).toFixed(2)}{' '}
                will be reset to $0.
              </p>
              <div className={styles.formRow}>
                <label htmlFor="payoutNotes">Notes (optional)</label>
                <input
                  id="payoutNotes"
                  value={payoutNotes}
                  onChange={(e) => setPayoutNotes(e.target.value)}
                  placeholder="e.g., cash, bank transfer, bonus"
                />
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Confirm Payment
                </button>
                <button
                  type="button"
                  onClick={handleCancelPayout}
                  className={`${styles.btn} ${styles.btnGhost}`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/admin" element={<Admin />} />
      <Route path="/chores" element={<ChoreAdmin />} />
      <Route path="/history" element={<PaymentHistory />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
