import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import styles from './AdminLayout.module.css'

export default function AdminLayout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()

  async function handleExitAdmin(e) {
    e.preventDefault()
    await api.exitAdminMode().catch(() => null)
    sessionStorage.removeItem('adminModeToken')
    navigate('/')
  }

  const isFamily = location.pathname === '/admin'
  const isChores = location.pathname === '/chores'

  return (
    <div className={styles.layout}>
      <nav className={styles.sideNav} aria-label="Admin navigation">
        <div className={styles.navTop}>
          <Link to="/" className={styles.navLogo}>🐾 Chorgie</Link>
          <span className={styles.adminBadge}>Admin</span>
        </div>

        <ul className={styles.navList}>
          <li>
            <Link
              to="/admin"
              className={`${styles.navLink}${isFamily ? ` ${styles.navLinkActive}` : ''}`}
            >
              Family
            </Link>
          </li>
          <li>
            <Link
              to="/chores"
              className={`${styles.navLink}${isChores ? ` ${styles.navLinkActive}` : ''}`}
            >
              Chores
            </Link>
          </li>
        </ul>

        <div className={styles.navBottom}>
          <button type="button" onClick={handleExitAdmin} className={styles.exitBtn}>
            Exit Admin
          </button>
        </div>
      </nav>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
