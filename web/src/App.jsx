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
                <button
                  type="button"
                  onClick={() => handleKidSelect(kid.id)}
                  className={`${styles.kidSelectBtn}${selectedKidId === kid.id ? ` ${styles.kidSelectBtnActive}` : ''}`}
                >
                  <span className={styles.kidAvatar}>
                    {AVATAR_EMOJI[kid.avatar_id] ?? '🐾'}
                  </span>
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
            No kid profiles yet. Enter admin mode to add one.
          </p>
        )}
      </div>

      {selectedKid ? (
        <div className={styles.choresCard}>
          <p className={styles.sectionTitle}>Chores for {selectedKid.enc_display_name}</p>
          <p className={styles.balanceLine}>Balance: ${Number(selectedKid.balance ?? 0).toFixed(2)}</p>
          {loadingChores ? (
            <p className={styles.emptyState}>Loading chores…</p>
          ) : visibleChores.length ? (
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
          ) : (
            <p className={styles.emptyState}>No chores are available right now.</p>
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
      <Route path="/chores" element={<ChoreAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
