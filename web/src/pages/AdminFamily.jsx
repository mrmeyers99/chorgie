import { useState, useEffect } from "react";
import { Navigate, Link } from "react-router-dom";
import { api } from "../lib/api.js";
import AdminLayout from "./AdminLayout.jsx";
import styles from "./AdminFamily.module.css";

const AVATARS = [
  { id: "corgi-1", label: "Corgi #1" },
  { id: "corgi-2", label: "Corgi #2" },
  { id: "corgi-3", label: "Corgi #3" },
  { id: "corgi-4", label: "Corgi #4" },
  { id: "corgi-5", label: "Corgi #5" },
  { id: "corgi-6", label: "Corgi #6" },
  { id: "corgi-7", label: "Corgi #7" },
  { id: "corgi-8", label: "Corgi #8" },
  { id: "corgi-9", label: "Corgi #9" },
  { id: "corgi-10", label: "Corgi #10" },
  { id: "corgi-11", label: "Corgi #11" },
  { id: "corgi-12", label: "Corgi #12" },
];

export default function AdminFamily() {
  const userEmail = sessionStorage.getItem("userEmail");

  const [kids, setKids] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [kidName, setKidName] = useState("");
  const [avatarId, setAvatarId] = useState("corgi-1");
  const [showPayoutDialog, setShowPayoutDialog] = useState(false);
  const [payoutKidId, setPayoutKidId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");

  useEffect(() => {
    void loadKids();
  }, []);

  if (!userEmail) return <Navigate to="/login" replace />;

  async function loadKids() {
    setLoading(true);
    try {
      const data = await api.getKids();
      setKids((data.kids ?? []).filter((kid) => kid.is_active !== false));
    } catch (err) {
      setStatus(err.message ?? "Failed to load kid profiles.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateKid(e) {
    e.preventDefault();
    setStatus("");
    try {
      await api.createKid({ enc_display_name: kidName, avatar_id: avatarId });
      setKidName("");
      setAvatarId("corgi-1");
      setShowCreateForm(false);
      await loadKids();
      setStatus("Kid profile created.");
    } catch (err) {
      setStatus(err.message ?? "Unable to create kid profile.");
    }
  }

  async function handleDeleteKid(id) {
    setStatus("");
    try {
      await api.deleteKid(id);
      setStatus("Kid deactivated.");
      await loadKids();
    } catch (err) {
      setStatus(err.message ?? "Failed to deactivate kid.");
    }
  }

  function handleOpenPayoutDialog(kidId) {
    const kid = kids.find((k) => k.id === kidId);
    setPayoutKidId(kidId);
    setPayoutAmount(kid ? Number(kid.balance ?? 0).toFixed(2) : "");
    setPayoutNotes("");
    setShowPayoutDialog(true);
  }

  async function handleMarkPaid(e) {
    e.preventDefault();
    setStatus("");
    const kid = kids.find((k) => k.id === payoutKidId);
    if (!kid) return;
    const amount = Number(payoutAmount);
    const balance = Number(kid.balance ?? 0);
    if (!(amount > 0) || amount > balance) {
      setStatus(
        "Enter an amount greater than $0 and no more than the current balance.",
      );
      return;
    }
    try {
      await api.createPayout({
        kid_id: payoutKidId,
        amount,
        enc_notes: payoutNotes || undefined,
      });
      setStatus(
        `Recorded a $${amount.toFixed(2)} payment for ${kid.enc_display_name}!`,
      );
      setShowPayoutDialog(false);
      setPayoutAmount("");
      setPayoutNotes("");
      setPayoutKidId("");
      await loadKids();
    } catch (err) {
      setStatus(err.message ?? "Failed to record payment.");
    }
  }

  function handleCancelPayout() {
    setShowPayoutDialog(false);
    setPayoutAmount("");
    setPayoutNotes("");
    setPayoutKidId("");
  }

  const payoutKid = kids.find((k) => k.id === payoutKidId);

  return (
    <AdminLayout>
      <div className={styles.header}>
        <h1 className={styles.title}>Your Family</h1>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className={`${styles.addBtn}${showCreateForm ? ` ${styles.addBtnOpen}` : ""}`}
          aria-label={showCreateForm ? "Cancel adding kid" : "Add new kid"}
        >
          {showCreateForm ? "Cancel" : "Add Kid"}
        </button>
      </div>

      {status ? (
        <p role="status" className={styles.statusMsg}>
          {status}
        </p>
      ) : null}

      {showCreateForm && (
        <form
          onSubmit={handleCreateKid}
          className={styles.createForm}
          noValidate
        >
          <h2 className={styles.formTitle}>Add kid profile</h2>
          <div className={styles.formRow}>
            <label htmlFor="kidName">Display name</label>
            <input
              id="kidName"
              value={kidName}
              onChange={(e) => setKidName(e.target.value)}
              placeholder="Kid's name"
              required
              autoFocus
            />
          </div>
          <div className={styles.formRow}>
            <label id="avatar-picker-label">Avatar</label>
            <div
              className={styles.avatarPicker}
              aria-labelledby="avatar-picker-label"
            >
              {AVATARS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAvatarId(id)}
                  className={`${styles.avatarOption}${avatarId === id ? ` ${styles.avatarOptionSelected}` : ""}`}
                  title={label}
                  aria-pressed={avatarId === id}
                >
                  <img src={`/avatars/${id}.png`} alt={label} />
                </button>
              ))}
            </div>
          </div>
          <div className={styles.formActions}>
            <button
              type="submit"
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Add Kid
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className={`${styles.btn} ${styles.btnGhost}`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className={styles.emptyState}>Loading…</p>
      ) : kids.length === 0 ? (
        <p className={styles.emptyState}>
          No kid profiles yet. Hit the + button to add one.
        </p>
      ) : (
        <ul className={styles.kidGrid}>
          {kids.map((kid) => (
            <li key={kid.id} className={styles.kidCard}>
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
              <div className={styles.kidActions}>
                {Number(kid.balance ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleOpenPayoutDialog(kid.id)}
                    className={`${styles.btn} ${styles.btnPrimary}`}
                  >
                    Mark Paid
                  </button>
                )}
                <Link
                  to={`/history?kid=${kid.id}`}
                  state={{ from: "/admin" }}
                  className={`${styles.btn} ${styles.btnGhost}`}
                >
                  History
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDeleteKid(kid.id)}
                  className={`${styles.btn} ${styles.btnDanger}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showPayoutDialog && payoutKid && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <form onSubmit={handleMarkPaid}>
              <h2>Record a Payment</h2>
              <p>
                <strong>{payoutKid.enc_display_name}</strong>&apos;s current
                balance is ${Number(payoutKid.balance ?? 0).toFixed(2)}.
              </p>
              <div className={styles.formRow}>
                <label htmlFor="payoutAmount">Amount</label>
                <input
                  id="payoutAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Number(payoutKid.balance ?? 0)}
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  required
                />
              </div>
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
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
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
    </AdminLayout>
  );
}
