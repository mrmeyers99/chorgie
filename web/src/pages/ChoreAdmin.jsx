import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api.js'

const RECURRENCE_TYPES = ['one-time', 'fixed', 'completion-based']

const emptyForm = {
  enc_name: '',
  enc_description: '',
  reward_amount: '',
  recurrence_type: 'one-time',
  enc_recurrence_rule: '',
  assigned_to: '',
}

export default function ChoreAdmin() {
  const userEmail = sessionStorage.getItem('userEmail')
  const adminModeToken = sessionStorage.getItem('adminModeToken')

  const [chores, setChores] = useState([])
  const [kids, setKids] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!userEmail || !adminModeToken) return
    void loadChores()
    void loadKids()
  }, [])

  if (!userEmail) {
    return <Navigate to="/login" replace />
  }

  if (!adminModeToken) {
    return <Navigate to="/" replace />
  }

  async function loadChores() {
    setLoading(true)
    try {
      const data = await api.getChores()
      setChores(data.chores ?? [])
    } catch (err) {
      setStatus(err.message ?? 'Failed to load chores.')
    } finally {
      setLoading(false)
    }
  }

  async function loadKids() {
    try {
      const data = await api.getKids()
      setKids(data.kids ?? [])
    } catch {
      // non-critical
    }
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
      // Clear the recurrence rule when switching away from completion-based
      ...(name === 'recurrence_type' && value !== 'completion-based'
        ? { enc_recurrence_rule: '' }
        : {}),
    }))
  }

  function startEdit(chore) {
    setEditingId(chore.id)
    setForm({
      enc_name: chore.enc_name ?? '',
      enc_description: chore.enc_description ?? '',
      reward_amount: chore.reward_amount ?? '',
      recurrence_type: chore.recurrence_type ?? 'one-time',
      enc_recurrence_rule: chore.enc_recurrence_rule ?? '',
      assigned_to: chore.assigned_to ?? '',
    })
    setStatus('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(emptyForm)
    setStatus('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('')
    const payload = {
      enc_name: form.enc_name,
      reward_amount: Number(form.reward_amount),
      recurrence_type: form.recurrence_type,
    }
    if (form.enc_description) payload.enc_description = form.enc_description
    if (form.enc_recurrence_rule) payload.enc_recurrence_rule = form.enc_recurrence_rule
    if (form.assigned_to) payload.assigned_to = form.assigned_to

    try {
      if (editingId) {
        await api.updateChore(editingId, payload)
        setStatus('Chore updated.')
      } else {
        await api.createChore(payload)
        setStatus('Chore created.')
      }
      setEditingId(null)
      setForm(emptyForm)
      await loadChores()
    } catch (err) {
      setStatus(err.message ?? 'Failed to save chore.')
    }
  }

  async function handleDeactivate(id) {
    setStatus('')
    try {
      await api.deleteChore(id)
      setStatus('Chore deactivated.')
      await loadChores()
    } catch (err) {
      setStatus(err.message ?? 'Failed to deactivate chore.')
    }
  }

  return (
    <section style={{ padding: '40px 24px', maxWidth: 640, margin: '0 auto' }}>
      <h1>Chore Admin</h1>
      <p>
        <Link to="/">← Back to home</Link>
      </p>
      {status ? <p role="status">{status}</p> : null}

      <h2>{editingId ? 'Edit Chore' : 'Add Chore'}</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="enc_name">Name</label>
          <br />
          <input
            id="enc_name"
            name="enc_name"
            value={form.enc_name}
            onChange={handleChange}
            required
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <label htmlFor="enc_description">Description</label>
          <br />
          <input
            id="enc_description"
            name="enc_description"
            value={form.enc_description}
            onChange={handleChange}
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <label htmlFor="reward_amount">Reward amount</label>
          <br />
          <input
            id="reward_amount"
            name="reward_amount"
            type="number"
            min="0"
            step="any"
            value={form.reward_amount}
            onChange={handleChange}
            required
          />
        </div>
        <div style={{ marginTop: 8 }}>
          <label htmlFor="recurrence_type">Recurrence type</label>
          <br />
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
        {form.recurrence_type === 'completion-based' && (
          <div style={{ marginTop: 8 }}>
            <label htmlFor="enc_recurrence_rule">Days after last completion</label>
            <br />
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
        <div style={{ marginTop: 8 }}>
          <label htmlFor="assigned_to">Assign to kid</label>
          <br />
          <select
            id="assigned_to"
            name="assigned_to"
            value={form.assigned_to}
            onChange={handleChange}
          >
            <option value="">— Unassigned —</option>
            {kids.map((kid) => (
              <option key={kid.id} value={kid.id}>
                {kid.enc_display_name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="submit">{editingId ? 'Save changes' : 'Add Chore'}</button>
          {editingId && (
            <button type="button" onClick={cancelEdit} style={{ marginLeft: 8 }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2 style={{ marginTop: 32 }}>Chores</h2>
      {loading ? (
        <p>Loading…</p>
      ) : chores.length === 0 ? (
        <p>No chores yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {chores.map((chore) => (
            <li
              key={chore.id}
              style={{
                borderBottom: '1px solid #ccc',
                padding: '8px 0',
                opacity: chore.is_active === false ? 0.5 : 1,
              }}
            >
              <strong>{chore.enc_name}</strong> — ${chore.reward_amount} ({chore.recurrence_type})
              {chore.is_active === false && ' [inactive]'}
              <span style={{ marginLeft: 12 }}>
                <button type="button" onClick={() => startEdit(chore)}>
                  Edit
                </button>
                {chore.is_active !== false && (
                  <button
                    type="button"
                    onClick={() => handleDeactivate(chore.id)}
                    style={{ marginLeft: 4 }}
                  >
                    Deactivate
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
