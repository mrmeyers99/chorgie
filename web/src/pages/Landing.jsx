import { Link } from "react-router-dom";
import styles from "./Landing.module.css";

const FEATURES = [
  {
    icon: "📋",
    title: "Assign chores",
    body: "Parents create chores, set reward amounts, and choose one-time, recurring, or always-available cadences.",
  },
  {
    icon: "🐾",
    title: "Kids earn as they go",
    body: "Kids tap their avatar, see what's available, and mark chores done to watch their balance grow.",
  },
  {
    icon: "🔐",
    title: "End-to-end encrypted",
    body: "Chore names, kid names, and notes are encrypted on your device with your household key — the server only ever sees ciphertext.",
  },
  {
    icon: "🚫",
    title: "Ad-free, always",
    body: "No ads, no trackers, no data resale. Chorgie is a tool for your family, not a product built on your attention.",
  },
  {
    icon: "🔒",
    title: "Parents stay in control",
    body: "A PIN-protected Admin Mode keeps chore, kid, and payout management separate from the kid-facing view.",
  },
  {
    icon: "💰",
    title: "Track payouts",
    body: "Mark balances paid when a payout cycle ends, and keep a running history for every kid.",
  },
];

export default function Landing() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <span className={styles.brand}>🐾 Chorgie</span>
        <div className={styles.navActions}>
          <Link to="/login" className={styles.navLink}>
            Log in
          </Link>
          <Link to="/register" className={styles.navCta}>
            Create household
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Chores, sorted. Kids, motivated.</h1>
        <p className={styles.heroTagline}>
          Chorgie is a simple, private place for families to assign chores,
          track who did what, and reward kids for getting it done.
        </p>
        <div className={styles.trustBadges}>
          <span>🔐 End-to-end encrypted</span>
          <span>🚫 Ad-free</span>
        </div>
        <div className={styles.heroActions}>
          <Link to="/register" className={`${styles.btn} ${styles.btnPrimary}`}>
            Create your household
          </Link>
          <Link to="/login" className={`${styles.btn} ${styles.btnSecondary}`}>
            Log in
          </Link>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map((feature) => (
          <div key={feature.title} className={styles.featureCard}>
            <span className={styles.featureIcon}>{feature.icon}</span>
            <h3 className={styles.featureTitle}>{feature.title}</h3>
            <p className={styles.featureBody}>{feature.body}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>
        <p>
          Already have a household? <Link to="/login">Log in</Link>
        </p>
      </footer>
    </main>
  );
}
