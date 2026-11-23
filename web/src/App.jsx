import { useState, useEffect } from "react";
import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import Register from "./pages/Register.jsx";
import Login from "./pages/Login.jsx";
import ChoreAdmin from "./pages/ChoreAdmin.jsx";
import SuperAdmin from "./pages/SuperAdmin.jsx";
import PaymentHistory from "./pages/PaymentHistory.jsx";
import AdminFamily from "./pages/AdminFamily.jsx";
import ChoreRequests from "./pages/ChoreRequests.jsx";
import { api, bootstrapSession } from "./lib/api.js";
import { encryptField, safeDecryptField } from "./lib/crypto.js";
import { requireHouseholdKey, clearHouseholdKey } from "./lib/keyStore.js";
import Modal from "./components/Modal.jsx";
import PageMeta from "./components/PageMeta.jsx";
import styles from "./App.module.css";

function getDaysOverdue(chore) {
  if (chore.recurrence_type !== "recurring" || !chore.next_available_at) {
    return 0;
  }
  const ms = Date.now() - new Date(chore.next_available_at).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function Home() {
  const navigate = useNavigate();
  const userEmail = sessionStorage.getItem("userEmail");
  const [status, setStatus] = useState("");
  const [kids, setKids] = useState([]);
  const [loadingKids, setLoadingKids] = useState(false);
  const [chores, setChores] = useState([]);
  const [loadingChores, setLoadingChores] = useState(false);
  const [selectedKidId, setSelectedKidId] = useState("");
  const [completingChoreId, setCompletingChoreId] = useState("");
  const [expandedChoreIds, setExpandedChoreIds] = useState(() => new Set());
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestAmount, setRequestAmount] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  useEffect(() => {
    if (!userEmail) return;
    void loadKids();
    void loadChores();
    void loadPendingRequests();
  }, [userEmail]);

  if (!userEmail) {
    return <Landing />;
  }

  async function loadKids() {
    setLoadingKids(true);
    try {
      const hek = await requireHouseholdKey();
      if (!hek) return;
      const data = await api.getKids();
      const decrypted = await Promise.all(
        (data.kids ?? []).map(async (kid) => ({
          ...kid,
          enc_display_name: await safeDecryptField(hek, kid.enc_display_name),
        })),
      );
      setKids(decrypted.filter((kid) => kid.is_active !== false));
    } catch (err) {
      setStatus(err.message ?? "Failed to load kid profiles.");
    } finally {
      setLoadingKids(false);
    }
  }

  async function loadChores() {
    setLoadingChores(true);
    try {
      const hek = await requireHouseholdKey();
      if (!hek) return;
      const data = await api.getChores();
      const decrypted = await Promise.all(
        (data.chores ?? []).map(async (chore) => ({
          ...chore,
          enc_name: await safeDecryptField(hek, chore.enc_name),
          enc_description: await safeDecryptField(hek, chore.enc_description),
        })),
      );
      setChores(decrypted);
    } catch (err) {
      setStatus(err.message ?? "Failed to load chores.");
    } finally {
      setLoadingChores(false);
    }
  }

  async function loadPendingRequests() {
    try {
      const hek = await requireHouseholdKey();
      if (!hek) return;
      const data = await api.getChoreRequests({ status: "pending" });
      const decrypted = await Promise.all(
        (data.requests ?? []).map(async (req) => ({
          ...req,
          enc_name: await safeDecryptField(hek, req.enc_name),
        })),
      );
      setPendingRequests(decrypted);
    } catch {
      // non-critical: the chore list still works without it
    }
  }

  function openRequestDialog() {
    setRequestName("");
    setRequestAmount("");
    setShowRequestDialog(true);
  }

  function closeRequestDialog() {
    if (submittingRequest) return;
    setShowRequestDialog(false);
  }

  async function handleSubmitRequest(e) {
    e.preventDefault();
    if (!selectedKid) return;
    const name = requestName.trim();
    if (!name) return;
    setStatus("");
    setSubmittingRequest(true);
    try {
      const hek = await requireHouseholdKey();
      if (!hek) return;
      const payload = {
        kid_id: selectedKid.id,
        enc_name: await encryptField(hek, name),
      };
      if (requestAmount !== "") {
        payload.requested_amount = Number(requestAmount);
      }
      await api.createChoreRequest(payload);
      setShowRequestDialog(false);
      await loadPendingRequests();
      setStatus(
        `Sent "${name}" to a grown-up for approval. Nice work, ${selectedKid.enc_display_name}!`,
      );
    } catch (err) {
      setStatus(err.message ?? "Failed to send chore for approval.");
    } finally {
      setSubmittingRequest(false);
    }
  }

  function handleKidSelect(id) {
    setSelectedKidId(id);
  }

  function toggleChoreDescription(choreId) {
    setExpandedChoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(choreId)) {
        next.delete(choreId);
      } else {
        next.add(choreId);
      }
      return next;
    });
  }

  async function handleCompleteChore(choreId) {
    if (!selectedKid) return;
    setStatus("");
    setCompletingChoreId(choreId);
    try {
      const data = await api.completeChore(choreId, { kid_id: selectedKid.id });
      await Promise.all([loadChores(), loadKids()]);
      const reward = Number(data.reward_amount);
      setStatus(
        Number.isFinite(reward)
          ? `${selectedKid.enc_display_name} earned $${reward.toFixed(2)}!`
          : "Chore completed.",
      );
    } catch (err) {
      setStatus(err.message ?? "Failed to complete chore.");
    } finally {
      setCompletingChoreId("");
    }
  }

  async function handleLogout(e) {
    e.preventDefault();
    await api.logout().catch(() => null);
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("csrfToken");
    sessionStorage.removeItem("adminModeToken");
    sessionStorage.removeItem("userEmail");
    sessionStorage.removeItem("isSuperAdmin");
    await clearHouseholdKey();
    navigate("/login", { replace: true });
  }

  const selectedKid = kids.find(
    (kid) => kid.id === selectedKidId && kid.is_active !== false,
  );
  const visibleChores = selectedKid
    ? chores.filter((chore) => {
        if (chore.is_active === false) {
          return false;
        }
        if (chore.is_available === false) {
          return false;
        }
        const eligibleKids = Array.isArray(chore.eligible_kids)
          ? chore.eligible_kids
          : [];
        return (
          eligibleKids.length === 0 || eligibleKids.includes(selectedKid.id)
        );
      })
    : [];

  const selectedKidPendingRequests = selectedKid
    ? pendingRequests.filter((req) => req.kid_id === selectedKid.id)
    : [];

  // Upcoming chores: recurring chores that are not yet available but will be soon
  const upcomingChores = selectedKid
    ? chores
        .filter((chore) => {
          if (chore.is_active === false) {
            return false;
          }
          if (chore.recurrence_type !== "recurring") {
            return false;
          }
          if (chore.is_available === true) {
            return false;
          }
          const eligibleKids = Array.isArray(chore.eligible_kids)
            ? chore.eligible_kids
            : [];
          return (
            eligibleKids.length === 0 || eligibleKids.includes(selectedKid.id)
          );
        })
        .sort((a, b) => {
          // Sort by next_available_at, showing soonest first
          if (!a.next_available_at && !b.next_available_at) return 0;
          if (!a.next_available_at) return 1;
          if (!b.next_available_at) return -1;
          return (
            new Date(a.next_available_at).getTime() -
            new Date(b.next_available_at).getTime()
          );
        })
    : [];

  return (
    <main className={styles.page}>
      <PageMeta title="Home" noindex />
      <header className={styles.appHeader}>
        <h1 className={styles.appTitle}>🐾 Chorgie</h1>
        <div className={styles.topActions}>
          <span className={styles.appSubtitle}>Welcome, {userEmail}</span>
          <Link to="/admin" className={styles.btnGhost}>
            Admin
          </Link>
          <a href="/login" onClick={handleLogout} className={styles.btnGhost}>
            Log out
          </a>
        </div>
      </header>

      {status ? (
        <p role="status" className={styles.statusMsg}>
          {status}
        </p>
      ) : null}

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
                  className={`${styles.kidSelectBtn}${selectedKidId === kid.id ? ` ${styles.kidSelectBtnActive}` : ""}`}
                >
                  <img
                    src={`/avatars/${kid.avatar_id}.png`}
                    alt={`${kid.enc_display_name}'s avatar`}
                    className={styles.kidAvatar}
                    onError={(e) => {
                      e.currentTarget.src = "/avatars/corgi-1.png";
                    }}
                  />
                  <span className={styles.kidName}>{kid.enc_display_name}</span>
                  <span className={styles.kidBalance}>
                    ${Number(kid.balance ?? 0).toFixed(2)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.emptyState}>
            No kid profiles yet. Visit the <Link to="/admin">Admin page</Link>{" "}
            to add one.
          </p>
        )}
      </div>

      {selectedKid ? (
        <div className={styles.choresCard}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <div>
              <p className={styles.sectionTitle}>
                Chores for {selectedKid.enc_display_name}
              </p>
              <p className={styles.balanceLine}>
                Balance: ${Number(selectedKid.balance ?? 0).toFixed(2)}
              </p>
            </div>
            <div className={styles.choresCardActions}>
              <button
                type="button"
                onClick={openRequestDialog}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                + I did something else
              </button>
              <Link
                to={`/history?kid=${selectedKid.id}`}
                className={`${styles.btn} ${styles.btnSecondary}`}
              >
                View History
              </Link>
            </div>
          </div>
          {loadingChores ? (
            <p className={styles.emptyState}>Loading chores…</p>
          ) : visibleChores.length === 0 && upcomingChores.length === 0 ? (
            <p className={styles.emptyState}>
              No chores are available right now.
            </p>
          ) : (
            <>
              {visibleChores.length > 0 && (
                <ul className={styles.choreList}>
                  {visibleChores.map((chore) => {
                    const daysOverdue = getDaysOverdue(chore);
                    return (
                      <li key={chore.id} className={styles.choreItem}>
                        <div className={styles.choreRow}>
                          {chore.enc_description ? (
                            <button
                              type="button"
                              onClick={() => toggleChoreDescription(chore.id)}
                              className={styles.choreNameBtn}
                              aria-expanded={expandedChoreIds.has(chore.id)}
                            >
                              <span className={styles.choreName}>
                                {chore.enc_name}
                              </span>
                              <span className={styles.expandIcon}>
                                {expandedChoreIds.has(chore.id) ? "▲" : "▼"}
                              </span>
                            </button>
                          ) : (
                            <span className={styles.choreName}>
                              {chore.enc_name}
                            </span>
                          )}
                          <span className={styles.choreMeta}>
                            ${chore.reward_amount}
                            {daysOverdue > 0 && (
                              <span className={styles.overdueBadge}>
                                {daysOverdue} day{daysOverdue === 1 ? "" : "s"}{" "}
                                overdue
                              </span>
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCompleteChore(chore.id)}
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            disabled={completingChoreId === chore.id}
                          >
                            {completingChoreId === chore.id
                              ? "Completing…"
                              : "Complete"}
                          </button>
                        </div>
                        {chore.enc_description &&
                        expandedChoreIds.has(chore.id) ? (
                          <p className={styles.choreDescription}>
                            {chore.enc_description}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {upcomingChores.length > 0 && (
                <>
                  {visibleChores.length > 0 && (
                    <p
                      className={styles.sectionTitle}
                      style={{ marginTop: "24px" }}
                    >
                      Upcoming Chores
                    </p>
                  )}
                  <ul className={styles.choreList}>
                    {upcomingChores.map((chore) => (
                      <li
                        key={chore.id}
                        className={`${styles.choreItem} ${styles.choreItemDisabled}`}
                      >
                        <div className={styles.choreRow}>
                          <span className={styles.choreName}>
                            {chore.enc_name}
                          </span>
                          <span className={styles.choreMeta}>
                            ${chore.reward_amount}
                            {chore.next_available_at && (
                              <span
                                style={{
                                  marginLeft: "8px",
                                  fontSize: "0.85em",
                                }}
                              >
                                Available{" "}
                                {new Date(
                                  chore.next_available_at,
                                ).toLocaleDateString()}
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
                        </div>
                        {chore.enc_description ? (
                          <p className={styles.choreDescription}>
                            {chore.enc_description}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {selectedKidPendingRequests.length > 0 && (
            <>
              <p className={styles.sectionTitle} style={{ marginTop: "24px" }}>
                Waiting for Approval
              </p>
              <ul className={styles.choreList}>
                {selectedKidPendingRequests.map((req) => (
                  <li
                    key={req.id}
                    className={`${styles.choreItem} ${styles.choreItemDisabled}`}
                  >
                    <div className={styles.choreRow}>
                      <span className={styles.choreName}>{req.enc_name}</span>
                      <span className={styles.choreMeta}>
                        {req.requested_amount !== null
                          ? `$${Number(req.requested_amount).toFixed(2)}`
                          : "Grown-up decides"}
                      </span>
                      <span className={styles.pendingBadge}>Pending</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      {showRequestDialog && selectedKid && (
        <Modal onClose={closeRequestDialog}>
          <form onSubmit={handleSubmitRequest}>
            <h2>I did something else!</h2>
            <p>
              Tell a grown-up what you did. They&apos;ll approve it before it
              counts toward {selectedKid.enc_display_name}&apos;s balance.
            </p>
            <div className={styles.formRow}>
              <label htmlFor="requestName">What did you do?</label>
              <input
                id="requestName"
                value={requestName}
                onChange={(e) => setRequestName(e.target.value)}
                placeholder="e.g., Raked the leaves"
                maxLength={200}
                required
              />
            </div>
            <div className={styles.formRow}>
              <label htmlFor="requestAmount">
                How much do you think it&apos;s worth? (optional)
              </label>
              <input
                id="requestAmount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={requestAmount}
                onChange={(e) => setRequestAmount(e.target.value)}
                placeholder="Leave blank to let a grown-up decide"
              />
            </div>
            <div className={styles.formActions}>
              <button
                type="submit"
                disabled={submittingRequest || !requestName.trim()}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                {submittingRequest ? "Sending…" : "Send for approval"}
              </button>
              <button
                type="button"
                onClick={closeRequestDialog}
                disabled={submittingRequest}
                className={`${styles.btn} ${styles.btnGhost}`}
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}

function App() {
  const [checkingSession, setCheckingSession] = useState(
    () => !sessionStorage.getItem("userEmail"),
  );

  useEffect(() => {
    if (!checkingSession) return;
    let cancelled = false;
    bootstrapSession().finally(() => {
      if (!cancelled) setCheckingSession(false);
    });
    return () => {
      cancelled = true;
    };
  }, [checkingSession]);

  if (checkingSession) {
    return (
      <main className={styles.page}>
        <p className={styles.emptyState}>Loading…</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/admin"
        element={
          <>
            <PageMeta title="Family" noindex />
            <AdminFamily />
          </>
        }
      />
      <Route
        path="/chores"
        element={
          <>
            <PageMeta title="Chores" noindex />
            <ChoreAdmin />
          </>
        }
      />
      <Route
        path="/requests"
        element={
          <>
            <PageMeta title="Requests" noindex />
            <ChoreRequests />
          </>
        }
      />
      <Route
        path="/history"
        element={
          <>
            <PageMeta title="History" noindex />
            <PaymentHistory />
          </>
        }
      />
      <Route
        path="/super-admin"
        element={
          <>
            <PageMeta title="Households" noindex />
            <SuperAdmin />
          </>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
