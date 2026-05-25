import { Routes, Route, Navigate } from 'react-router-dom'
import Register from './pages/Register.jsx'

function Home() {
  return (
    <section style={{ padding: '40px 24px', textAlign: 'center' }}>
      <h1>Chorgie</h1>
      <p>Welcome! Your household is set up.</p>
    </section>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
