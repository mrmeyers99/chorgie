import { Routes, Route, Navigate } from 'react-router-dom'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'

function Home() {
  const userEmail = sessionStorage.getItem('userEmail')
  if (!userEmail) {
    return <Navigate to="/login" replace />
  }

  return (
    <section style={{ padding: '40px 24px', textAlign: 'center' }}>
      <h1>Chorgie</h1>
      <p>Welcome, {userEmail}!</p>
    </section>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
