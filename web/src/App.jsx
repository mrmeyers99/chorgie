import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import ChoreAdmin from './pages/ChoreAdmin.jsx'
import PaymentHistory from './pages/PaymentHistory.jsx'
import { api } from './lib/api.js'
import styles from './App.module.css'

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
  const [showAvatarDialog, setShowAvatarDialog] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState('corgi-1')

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

  function handleOpenAvatarDialog() {
    if (!selectedKid) return
    setSelectedAvatar(selectedKid.avatar_id)
    setShowAvatarDialog(true)
  }

  async function handleSaveAvatar(e) {
    e.preventDefault()
    if (!selectedKid) return
    setStatus('')
    try {
      await api.updateKidAvatar(selectedKid.id, { avatar_id: selectedAvatar })
      setStatus(`Avatar updated for ${selectedKid.enc_display_name}!`)
      setShowAvatarDialog(false)
      await loadKids()
    } catch (err) {
      setStatus(err.message ?? 'Failed to update avatar.')
    }
  }

  function handleCancelAvatar() {
    setShowAvatarDialog(false)
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
          <>
            <h2>Admin Mode Active 🔓</h2>
            <div className={styles.adminLinks}>
              <Link to="/chores" className={`${styles.btn} ${styles.btnSecondary}`}>
                Manage chores
              </Link>
              <Link to="/history" className={`${styles.btn} ${styles.btnSecondary}`}>
                Payment history
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleOpenAvatarDialog}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                Change Avatar
              </button>
              <Link to={`/history?kid=${selectedKid.id}`} className={`${styles.btn} ${styles.btnSecondary}`}>
                View History
              </Link>
            </div>
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

      {showAvatarDialog && selectedKid && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <form onSubmit={handleSaveAvatar}>
              <h2>Change Avatar for {selectedKid.enc_display_name}</h2>
              <div className={styles.formRow}>
                <label id="avatar-dialog-label">Select your avatar</label>
                <div className={styles.avatarPicker} aria-labelledby="avatar-dialog-label">
                  {AVATARS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSelectedAvatar(id)}
                      className={`${styles.avatarOption}${selectedAvatar === id ? ` ${styles.avatarOptionSelected}` : ''}`}
                      title={label}
                      aria-pressed={selectedAvatar === id}
                    >
                      <img src={`/avatars/${id}.png`} alt={label} />
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.formActions}>
                <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`}>
                  Save Avatar
                </button>
                <button
                  type="button"
                  onClick={handleCancelAvatar}
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
      <Route path="/history" element={<PaymentHistory />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
