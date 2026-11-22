import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { safeDecryptField } from "../lib/crypto.js";
import { requireHouseholdKey } from "../lib/keyStore.js";
import { CHORE_REQUESTS_CHANGED_EVENT } from "../lib/choreRequestEvents.js";
import AdminLayout from "./AdminLayout.jsx";
import styles from "./ChoreRequests.module.css";

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ChoreRequests() {
  const userEmail = sessionStorage.getItem("userEmail");

  const [requests, setRequests] = useState([]);
  const [kidsById, setKidsById] = useState({});
  // Per-request amount the admin will approve, keyed by request id
  const [amounts, setAmounts] = useState({});
  const [busyId, setBusyId] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadData();
  }, []);

  if (!userEmail) {
    return <Navigate to="/login" replace />;
  }

  async function loadData() {
    setLoading(true);
    try {
      const hek = await requireHouseholdKey();
      if (!hek) return;
      const [requestsData, kidsData] = await Promise.all([
        api.getChoreRequests({ status: "pending" }),
        api.getKids(),
      ]);
      const [decryptedRequests, decryptedKids] = await Promise.all([
        Promise.all(
          (requestsData.requests ?? []).map(async (req) => ({
            ...req,
            enc_name: await safeDecryptField(hek, req.enc_name),
          })),
        ),
        Promise.all(
          (kidsData.kids ?? []).map(async (kid) => ({
            ...kid,
            enc_display_name: await safeDecryptField(hek, kid.enc_display_name),
          })),
        ),
      ]);
      setRequests(decryptedRequests);
      setKidsById(Object.fromEntries(decryptedKids.map((k) => [k.id, k])));
      setAmounts((prev) => {
        const next = {};
        for (const req of decryptedRequests) {
          next[req.id] =
            prev[req.id] ??
            (req.requested_amount !== null
              ? Number(req.requested_amount).toFixed(2)
              : "");
        }
        return next;
      });
    } catch (err) {
      setStatus(err.message ?? "Failed to load chore requests.");
    } finally {
      setLoading(false);
    }
  }

  function notifyChanged() {
    window.dispatchEvent(new Event(CHORE_REQUESTS_CHANGED_EVENT));
  }

  async function handleApprove(req) {
    const raw = amounts[req.id];
    if (raw === "" || raw === undefined) {
      setStatus("Enter an amount before approving.");
      return;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      setStatus("Amount must be $0 or more.");
      return;
    }
    setStatus("");
    setBusyId(req.id);
    try {
      await api.approveChoreRequest(req.id, { amount });
      const kidName = kidsById[req.kid_id]?.enc_display_name ?? "Kid";
      setStatus(
        `Approved "${req.enc_name}" — ${kidName} earned $${amount.toFixed(2)}.`,
      );
      notifyChanged();
      await loadData();
    } catch (err) {
      setStatus(err.message ?? "Failed to approve request.");
      if (err.status === 409 || err.status === 404) await loadData();
    } finally {
      setBusyId("");
    }
  }

  async function handleReject(req) {
    if (!window.confirm(`Decline "${req.enc_name}"? No money will be added.`)) {
      return;
    }
    setStatus("");
    setBusyId(req.id);
    try {
      await api.rejectChoreRequest(req.id);
      setStatus(`Declined "${req.enc_name}".`);
      notifyChanged();
      await loadData();
    } catch (err) {
      setStatus(err.message ?? "Failed to decline request.");
      if (err.status === 409 || err.status === 404) await loadData();
    } finally {
      setBusyId("");
    }
  }

  return (
    <AdminLayout>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Chore Requests</h1>
        </div>
        <p className={styles.intro}>
          Chores your kids did that weren&apos;t on the list. Approve to add the
          amount to their balance, or decline.
        </p>

        {status ? (
          <p role="status" className={styles.statusMsg}>
            {status}
          </p>
        ) : null}

        {loading && requests.length === 0 ? (
          <p className={styles.loadingMsg}>Loading…</p>
        ) : requests.length === 0 ? (
          <p className={styles.emptyState}>
            No requests waiting for approval. 🐾
          </p>
        ) : (
          <ul className={styles.list}>
            {requests.map((req) => {
              const kid = kidsById[req.kid_id];
              const busy = busyId === req.id;
              return (
                <li key={req.id} className={styles.listItem}>
                  <div className={styles.listItemInfo}>
                    <div className={styles.listItemName}>{req.enc_name}</div>
                    <div className={styles.listItemMeta}>
                      {kid?.enc_display_name ?? "Unknown kid"} ·{" "}
                      {formatDate(req.created_at)} ·{" "}
                      {req.requested_amount !== null
                        ? `asked for $${Number(req.requested_amount).toFixed(2)}`
                        : "no amount requested"}
                    </div>
                  </div>
                  <div className={styles.listItemActions}>
                    <label className={styles.amountField}>
                      <span className={styles.srOnly}>
                        Amount to approve for {req.enc_name}
                      </span>
                      <span aria-hidden="true">$</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={amounts[req.id] ?? ""}
                        onChange={(e) =>
                          setAmounts((prev) => ({
                            ...prev,
                            [req.id]: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        disabled={busy}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void handleApprove(req)}
                      disabled={busy}
                      className={`${styles.btn} ${styles.btnPrimary}`}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReject(req)}
                      disabled={busy}
                      className={`${styles.btn} ${styles.btnDanger}`}
                    >
                      Decline
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
