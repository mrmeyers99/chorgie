import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api.js";
import AdminLayout from "./AdminLayout.jsx";
import styles from "./ChoreAdmin.module.css";

const RECURRENCE_TYPES = ["ad-hoc", "recurring", "always-available"];

const emptyForm = {
  enc_name: "",
  enc_description: "",
  reward_amount: "",
  recurrence_type: "ad-hoc",
  enc_recurrence_rule: "",
  eligible_kids: [],
};

export default function ChoreAdmin() {
  const userEmail = sessionStorage.getItem("userEmail");

  const [chores, setChores] = useState([]);
  const [kids, setKids] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadChores();
    void loadKids();
  }, []);

  if (!userEmail) {
    return <Navigate to="/login" replace />;
  }

  async function loadChores() {
    setLoading(true);
    try {
      const data = await api.getChores();
      setChores(data.chores ?? []);
    } catch (err) {
      setStatus(err.message ?? "Failed to load chores.");
    } finally {
      setLoading(false);
    }
  }

  async function loadKids() {
    try {
      const data = await api.getKids();
      setKids(data.kids ?? []);
    } catch {
      // non-critical
    }
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
      // Clear the recurrence rule when switching to recurrence types that do not use it
      ...(name === "recurrence_type" &&
      (value === "ad-hoc" || value === "always-available")
        ? { enc_recurrence_rule: "" }
        : {}),
    }));
  }

  function handleKidToggle(kidId) {
    setForm((prev) => {
      const already = prev.eligible_kids.includes(kidId);
      return {
        ...prev,
        eligible_kids: already
          ? prev.eligible_kids.filter((id) => id !== kidId)
          : [...prev.eligible_kids, kidId],
      };
    });
  }

  function handleSelectAllKids(e) {
    setForm((prev) => ({
      ...prev,
      eligible_kids: e.target.checked ? activeKids.map((k) => k.id) : [],
    }));
  }

  function startEdit(chore) {
    setShowForm(true);
    setEditingId(chore.id);
    setForm({
      enc_name: chore.enc_name ?? "",
      enc_description: chore.enc_description ?? "",
      reward_amount: chore.reward_amount ?? "",
      recurrence_type:
        chore.recurrence_type === "one-time"
          ? "ad-hoc"
          : (chore.recurrence_type ?? "ad-hoc"),
      enc_recurrence_rule: chore.enc_recurrence_rule ?? "",
      eligible_kids: chore.eligible_kids ?? [],
    });
    setStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
    setStatus("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("");
    const payload = {
      enc_name: form.enc_name,
      reward_amount: Number(form.reward_amount),
      recurrence_type: form.recurrence_type,
      eligible_kids: form.eligible_kids,
    };
    if (form.enc_description) payload.enc_description = form.enc_description;
    if (form.enc_recurrence_rule)
      payload.enc_recurrence_rule = form.enc_recurrence_rule;

    try {
      if (editingId) {
        await api.updateChore(editingId, payload);
        setStatus("Chore updated.");
      } else {
        await api.createChore(payload);
        setStatus("Chore created.");
      }
      setEditingId(null);
      setShowForm(false);
      setForm(emptyForm);
      await loadChores();
    } catch (err) {
      setStatus(err.message ?? "Failed to save chore.");
    }
  }

  async function handleDeactivate(id) {
    setStatus("");
    try {
      await api.deleteChore(id);
      setStatus("Chore deactivated.");
      await loadChores();
    } catch (err) {
      setStatus(err.message ?? "Failed to deactivate chore.");
    }
  }

  async function handleReactivate(id) {
    setStatus("");
    try {
      await api.updateChore(id, { is_active: true });
      setStatus("Chore activated.");
      await loadChores();
    } catch (err) {
      setStatus(err.message ?? "Failed to activate chore.");
    }
  }

  async function handleOverrideAvailability(id) {
    setStatus("");
    try {
      await api.overrideChoreAvailability(id);
      setStatus("Chore availability overridden. It is now available.");
      await loadChores();
    } catch (err) {
      setStatus(err.message ?? "Failed to override availability.");
    }
  }

  const sortedChores = [...chores].sort((left, right) => {
    const leftLastCompleted = left.last_completed_at;
    const rightLastCompleted = right.last_completed_at;

    if (leftLastCompleted && rightLastCompleted) {
      const timeDiff =
        new Date(rightLastCompleted).getTime() -
        new Date(leftLastCompleted).getTime();
      if (timeDiff !== 0) return timeDiff;
    } else if (leftLastCompleted) {
      return -1;
    } else if (rightLastCompleted) {
      return 1;
    }

    return String(left.enc_name ?? "").localeCompare(
      String(right.enc_name ?? ""),
    );
  });

  const activeKids = kids.filter((k) => k.is_active !== false);

  return (
    <AdminLayout>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Chores</h1>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className={`${styles.btn} ${styles.btnPrimary}`}
            >
              Add Chore
            </button>
          )}
        </div>

        {status ? (
          <p role="status" className={styles.statusMsg}>
            {status}
          </p>
        ) : null}

        {showForm && (
          <div className={styles.card}>
            <h2>{editingId ? "Edit Chore" : "Add Chore"}</h2>
            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.formRow}>
                <label htmlFor="enc_name">Name</label>
                <input
                  id="enc_name"
                  name="enc_name"
                  value={form.enc_name}
                  onChange={handleChange}
                  placeholder="e.g. Take out the trash"
                  autoFocus
                  required
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="enc_description">Description (optional)</label>
                <input
                  id="enc_description"
                  name="enc_description"
                  value={form.enc_description}
                  onChange={handleChange}
                  placeholder="Extra details…"
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="reward_amount">Reward amount ($)</label>
                <input
                  id="reward_amount"
                  name="reward_amount"
                  type="number"
                  min="0"
                  step="any"
                  value={form.reward_amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className={styles.formRow}>
                <label htmlFor="recurrence_type">Recurrence</label>
                <select
                  id="recurrence_type"
                  name="recurrence_type"
                  value={form.recurrence_type}
                  onChange={handleChange}
                >
                  {RECURRENCE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {form.recurrence_type === "recurring" && (
                <div className={styles.formRow}>
                  <label htmlFor="enc_recurrence_rule">
                    Repeat every (days)
                  </label>
                  <input
                    id="enc_recurrence_rule"
                    name="enc_recurrence_rule"
                    type="number"
                    min="1"
                    step="1"
                    value={form.enc_recurrence_rule}
                    onChange={handleChange}
                    required
                  />
                </div>
              )}

              <div className={styles.formRow}>
                <label>Eligible kids</label>
                <div className={styles.checkboxGroup}>
                  {activeKids.length === 0 ? (
                    <span className={styles.emptyHint}>No kids added yet.</span>
                  ) : (
                    <>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={
                            form.eligible_kids.length === activeKids.length &&
                            activeKids.length > 0
                          }
                          onChange={handleSelectAllKids}
                        />
                        Select all
                      </label>
                      {activeKids.map((kid) => (
                        <label key={kid.id} className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            checked={form.eligible_kids.includes(kid.id)}
                            onChange={() => handleKidToggle(kid.id)}
                          />
                          {kid.enc_display_name}
                        </label>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className={styles.formActions}>
                <button
                  type="submit"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                >
                  {editingId ? "Save changes" : "Add Chore"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className={`${styles.btn} ${styles.btnGhost}`}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <p className={styles.sectionTitle}>Chores</p>
        {loading ? (
          <p className={styles.loadingMsg}>Loading…</p>
        ) : chores.length === 0 ? (
          <p className={styles.loadingMsg}>No chores yet.</p>
        ) : (
          <ul className={styles.list}>
            {sortedChores.map((chore) => (
              <li
                key={chore.id}
                className={`${styles.listItem}${chore.is_active === false ? ` ${styles.inactive}` : ""}`}
              >
                <div className={styles.listItemInfo}>
                  <div className={styles.listItemName}>
                    {chore.enc_name}
                    {chore.is_active === false && (
                      <span className={styles.inactiveBadge}>inactive</span>
                    )}
                  </div>
                  <div className={styles.listItemMeta}>
                    <div>
                      ${chore.reward_amount} · {chore.recurrence_type}
                      {chore.recurrence_type === "recurring" &&
                        chore.enc_recurrence_rule && (
                          <>
                            {" "}
                            · every {chore.enc_recurrence_rule}{" "}
                            {Number(chore.enc_recurrence_rule) === 1
                              ? "day"
                              : "days"}
                          </>
                        )}
                    </div>
                    {(chore.last_completed_at ||
                      (chore.next_available_at && !chore.is_available)) && (
                      <div>
                        {chore.last_completed_at && (
                          <>
                            Last:{" "}
                            {new Date(
                              chore.last_completed_at,
                            ).toLocaleDateString()}
                          </>
                        )}
                        {chore.next_available_at && !chore.is_available && (
                          <>
                            {chore.last_completed_at ? " · " : ""}Next:{" "}
                            {new Date(
                              chore.next_available_at,
                            ).toLocaleDateString()}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className={styles.listItemActions}>
                  <button
                    type="button"
                    onClick={() => startEdit(chore)}
                    className={`${styles.btn} ${styles.btnGhost}`}
                  >
                    Edit
                  </button>
                  {chore.is_active !== false ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDeactivate(chore.id)}
                        className={`${styles.btn} ${styles.btnDanger}`}
                      >
                        Deactivate
                      </button>
                      {chore.recurrence_type === "recurring" &&
                        !chore.is_available && (
                          <button
                            type="button"
                            onClick={() => handleOverrideAvailability(chore.id)}
                            className={`${styles.btn} ${styles.btnSecondary}`}
                            title="Make this chore available now, even though the recurrence period hasn't elapsed"
                          >
                            Make Available Early
                          </button>
                        )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReactivate(chore.id)}
                      className={`${styles.btn} ${styles.btnSecondary}`}
                    >
                      Activate
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminLayout>
  );
}
