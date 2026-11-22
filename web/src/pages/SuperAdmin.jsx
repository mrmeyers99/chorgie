import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../lib/api.js";
import AdminLayout from "./AdminLayout.jsx";
import styles from "./SuperAdmin.module.css";

function formatCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HouseholdsTable() {
  const [households, setHouseholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .getSuperAdminHouseholds()
      .then((data) => {
        if (!cancelled) setHouseholds(data.households ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus(err.message ?? "Unable to load households.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCompletions = households.reduce(
    (sum, h) => sum + h.completion_count,
    0,
  );

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Households</h1>
        {!loading && !status ? (
          <p className={styles.summary}>
            {households.length} household{households.length === 1 ? "" : "s"} ·{" "}
            {totalCompletions} completion{totalCompletions === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {status ? <p className={styles.statusMsg}>{status}</p> : null}

      {loading ? (
        <p className={styles.emptyState}>Loading…</p>
      ) : !status && households.length === 0 ? (
        <p className={styles.emptyState}>No households yet.</p>
      ) : !status ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Household ID</th>
                <th scope="col">Created</th>
                <th scope="col">Time zone</th>
                <th scope="col" className={styles.numeric}>
                  Completions
                </th>
              </tr>
            </thead>
            <tbody>
              {households.map((household) => (
                <tr key={household.id}>
                  <td className={styles.mono}>{household.id}</td>
                  <td>{formatCreatedAt(household.created_at)}</td>
                  <td>{household.timezone}</td>
                  <td className={styles.numeric}>
                    {household.completion_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export default function SuperAdmin() {
  const userEmail = sessionStorage.getItem("userEmail");
  if (!userEmail) return <Navigate to="/login" replace />;
  if (sessionStorage.getItem("isSuperAdmin") !== "true") {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminLayout>
      <HouseholdsTable />
    </AdminLayout>
  );
}
