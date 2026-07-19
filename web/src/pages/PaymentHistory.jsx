import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { api } from "../lib/api.js";
import { safeDecryptField } from "../lib/crypto.js";
import { requireHouseholdKey } from "../lib/keyStore.js";
import styles from "./PaymentHistory.module.css";

const AVATAR_EMOJI = {
  "corgi-1": "🐕",
  "corgi-2": "🐶",
  "corgi-3": "🦮",
  "corgi-4": "🐾",
};

const HISTORY_PAGE_SIZE = 20;

async function decryptHistoryEntries(hek, rawEntries) {
  return Promise.all(
    rawEntries.map(async (entry) => ({
      ...entry,
      chore_name:
        entry.type === "completion"
          ? await safeDecryptField(hek, entry.chore_name)
          : entry.chore_name,
      enc_notes:
        entry.type === "payout"
          ? await safeDecryptField(hek, entry.enc_notes)
          : entry.enc_notes,
    })),
  );
}

function PaymentHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const kidId = searchParams.get("kid");
  const userEmail = sessionStorage.getItem("userEmail");
  const backTo = location.state?.from;
  const hekRef = useRef(null);
  const requestIdRef = useRef(0);

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [kids, setKids] = useState([]);
  const [selectedKid, setSelectedKid] = useState(null);

  useEffect(() => {
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }

    // The route doesn't remount on a kid switch (same component, only the
    // ?kid= search param changes), so a still-in-flight request from the
    // previous kid must not be allowed to land on this kid's state
    const requestId = ++requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;

    async function loadData() {
      setLoading(true);
      setStatus("");
      setSelectedKid(null);
      setEntries([]);
      setNextCursor(null);
      setLoadingMore(false);

      try {
        const hek = await requireHouseholdKey();
        if (!hek || isStale()) return;
        hekRef.current = hek;

        const kidsData = await api.getKids();
        if (isStale()) return;
        const decryptedKids = await Promise.all(
          (kidsData.kids ?? []).map(async (kid) => ({
            ...kid,
            enc_display_name: await safeDecryptField(hek, kid.enc_display_name),
          })),
        );
        if (isStale()) return;
        const activeKids = decryptedKids.filter(
          (kid) => kid.is_active !== false,
        );
        setKids(activeKids);

        const targetKid =
          (kidId && activeKids.find((k) => k.id === kidId)) ??
          (!kidId && activeKids.length === 1 ? activeKids[0] : null);

        if (targetKid) {
          setSelectedKid(targetKid);
          const historyData = await api.getKidHistory(targetKid.id, {
            limit: HISTORY_PAGE_SIZE,
          });
          if (isStale()) return;
          const decrypted = await decryptHistoryEntries(
            hek,
            historyData.entries ?? [],
          );
          if (isStale()) return;
          setEntries(decrypted);
          setNextCursor(historyData.next_cursor ?? null);
        } else if (kidId) {
          setStatus("Kid not found.");
        }
      } catch (err) {
        if (!isStale()) setStatus(err.message ?? "Failed to load data.");
      } finally {
        if (!isStale()) setLoading(false);
      }
    }

    void loadData();
  }, [userEmail, kidId, navigate]);

  async function handleLoadMore() {
    if (!selectedKid || loadingMore) return;
    const requestId = requestIdRef.current;
    const isStale = () => requestIdRef.current !== requestId;

    setLoadingMore(true);
    try {
      const historyData = await api.getKidHistory(selectedKid.id, {
        limit: HISTORY_PAGE_SIZE,
        cursor: nextCursor,
      });
      if (isStale()) return;
      const decrypted = await decryptHistoryEntries(
        hekRef.current,
        historyData.entries ?? [],
      );
      if (isStale()) return;
      setEntries((prev) => [...prev, ...decrypted]);
      setNextCursor(historyData.next_cursor ?? null);
    } catch (err) {
      if (!isStale()) setStatus(err.message ?? "Failed to load more history.");
    } finally {
      if (!isStale()) setLoadingMore(false);
    }
  }

  function handleKidSelect(kid) {
    navigate(`/history?kid=${kid.id}`, { state: location.state });
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  if (!userEmail) {
    return null;
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Payment History</h1>
        <button
          type="button"
          onClick={() => navigate(backTo ?? "/")}
          className={styles.backButton}
        >
          {backTo ? "← Back to Admin" : "← Back to Home"}
        </button>
      </header>

      {status ? (
        <p role="status" className={styles.statusMsg}>
          {status}
        </p>
      ) : null}

      {!selectedKid && kids.length > 1 && (
        <div className={styles.kidSelector}>
          <p className={styles.sectionTitle}>
            Select a kid to view their history:
          </p>
          <ul className={styles.kidGrid}>
            {kids.map((kid) => (
              <li key={kid.id} className={styles.kidCard}>
                <button
                  type="button"
                  onClick={() => handleKidSelect(kid)}
                  className={styles.kidSelectBtn}
                >
                  <span className={styles.kidAvatar}>
                    {AVATAR_EMOJI[kid.avatar_id] ?? "🐾"}
                  </span>
                  <span className={styles.kidName}>{kid.enc_display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className={styles.emptyState}>Loading...</p>
      ) : selectedKid ? (
        <div className={styles.historyContent}>
          <div className={styles.kidInfo}>
            <span className={styles.kidAvatarLarge}>
              {AVATAR_EMOJI[selectedKid.avatar_id] ?? "🐾"}
            </span>
            <div>
              <h2 className={styles.kidNameLarge}>
                {selectedKid.enc_display_name}
              </h2>
              <p className={styles.kidBalance}>
                Current Balance: ${Number(selectedKid.balance ?? 0).toFixed(2)}
              </p>
            </div>
          </div>

          {kids.length > 1 && (
            <button
              onClick={() => navigate("/history", { state: location.state })}
              className={styles.changeKidBtn}
            >
              Change Kid
            </button>
          )}

          {entries.length > 0 ? (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>History</h3>
              <ul className={styles.completionsList}>
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className={`${styles.completionItem} ${
                      entry.type === "payout"
                        ? styles.entryPayout
                        : styles.entryCompletion
                    }`}
                  >
                    <div className={styles.completionInfo}>
                      <span className={styles.choreName}>
                        {entry.type === "completion"
                          ? entry.chore_name
                          : entry.enc_notes || "Payment"}
                      </span>
                      <span className={styles.completionDate}>
                        {formatDate(entry.occurred_at)}
                      </span>
                    </div>
                    <span className={styles.amount}>
                      {entry.type === "completion" ? "+" : "−"}$
                      {Number(entry.amount).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
              {nextCursor && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className={styles.loadMoreBtn}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          ) : (
            <p className={styles.emptyState}>No history yet.</p>
          )}
        </div>
      ) : kids.length === 0 && !loading ? (
        <p className={styles.emptyState}>
          No kid profiles found. Add a kid profile to get started.
        </p>
      ) : null}
    </main>
  );
}

export default PaymentHistory;
