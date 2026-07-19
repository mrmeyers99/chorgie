import { useState, useEffect } from "react";
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

function PaymentHistory() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const kidId = searchParams.get("kid");
  const userEmail = sessionStorage.getItem("userEmail");
  const backTo = location.state?.from;

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [completions, setCompletions] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [kids, setKids] = useState([]);
  const [selectedKid, setSelectedKid] = useState(null);

  useEffect(() => {
    if (!userEmail) {
      navigate("/login", { replace: true });
      return;
    }

    async function loadData() {
      setLoading(true);
      setStatus("");
      setSelectedKid(null);
      setCompletions([]);
      setPayouts([]);

      try {
        const hek = await requireHouseholdKey();
        if (!hek) return;

        const kidsData = await api.getKids();
        const decryptedKids = await Promise.all(
          (kidsData.kids ?? []).map(async (kid) => ({
            ...kid,
            enc_display_name: await safeDecryptField(hek, kid.enc_display_name),
          })),
        );
        const activeKids = decryptedKids.filter(
          (kid) => kid.is_active !== false,
        );
        setKids(activeKids);

        const targetKid =
          (kidId && activeKids.find((k) => k.id === kidId)) ??
          (!kidId && activeKids.length === 1 ? activeKids[0] : null);

        if (targetKid) {
          setSelectedKid(targetKid);
          const [completionsData, payoutsData] = await Promise.all([
            api.getKidCompletions(targetKid.id),
            api.getPayouts(targetKid.id),
          ]);
          const decryptedCompletions = await Promise.all(
            (completionsData.completions ?? []).map(async (completion) => ({
              ...completion,
              chore_name: await safeDecryptField(hek, completion.chore_name),
            })),
          );
          const decryptedPayouts = await Promise.all(
            (payoutsData.payouts ?? []).map(async (payout) => ({
              ...payout,
              enc_notes: await safeDecryptField(hek, payout.enc_notes),
            })),
          );
          setCompletions(decryptedCompletions);
          setPayouts(decryptedPayouts);
        } else if (kidId) {
          setStatus("Kid not found.");
        }
      } catch (err) {
        setStatus(err.message ?? "Failed to load data.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [userEmail, kidId, navigate]);

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

          {completions.length > 0 ? (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Completed Chores</h3>
              <ul className={styles.completionsList}>
                {completions.map((completion) => (
                  <li key={completion.id} className={styles.completionItem}>
                    <div className={styles.completionInfo}>
                      <span className={styles.choreName}>
                        {completion.chore_name}
                      </span>
                      <span className={styles.completionDate}>
                        {formatDate(completion.completed_at)}
                      </span>
                    </div>
                    <span className={styles.amount}>
                      ${Number(completion.reward_amount).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className={styles.emptyState}>No chores completed yet.</p>
          )}

          {payouts.length > 0 && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Payments Made</h3>
              <ul className={styles.completionsList}>
                {payouts.map((payout) => (
                  <li key={payout.id} className={styles.completionItem}>
                    <div className={styles.completionInfo}>
                      <span className={styles.choreName}>
                        {payout.enc_notes || "Payment"}
                      </span>
                      <span className={styles.completionDate}>
                        {formatDate(payout.paid_at)}
                      </span>
                    </div>
                    <span className={styles.amount}>
                      ${Number(payout.amount).toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
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
