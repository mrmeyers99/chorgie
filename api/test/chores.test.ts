import request from 'supertest'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { app } from '../src/app.js'

vi.mock('../src/db.js', () => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  }
  return {
    pool: {
      connect: vi.fn(() => Promise.resolve(mockClient)),
      query: vi.fn(),
    },
    connectToDatabase: vi.fn(),
    _mockClient: mockClient,
  }
})

process.env.JWT_SECRET = 'test-secret-for-unit-tests'

async function getMockClient() {
  const mod = await import('../src/db.js')
  // @ts-expect-error accessing internal mock
  return mod._mockClient as {
    query: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
}

function makeAccessToken() {
  return jwt.sign(
    { sub: 'user-uuid', householdId: 'household-uuid' },
    process.env.JWT_SECRET as string,
    { expiresIn: '15m' }
  )
}

function makeAdminModeToken() {
  return jwt.sign(
    { sub: 'user-uuid', householdId: 'household-uuid', type: 'admin' },
    process.env.JWT_SECRET as string,
    { expiresIn: '10m' }
  )
}

const sampleChore = {
  id: 'chore-1',
  household_id: 'household-uuid',
  enc_name: 'enc-take-out-trash',
  enc_description: null,
  reward_amount: '2.50',
  recurrence_type: 'ad-hoc',
  enc_recurrence_rule: 'enc-weekly-monday',
  eligible_kids: [],
  is_active: true,
  is_available: true,
  last_completed_at: null,
  created_at: '2026-05-25T00:00:00.000Z',
}

describe('GET /chores', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('returns chore definitions for the household', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [sampleChore] })

    const res = await request(app)
      .get('/chores')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.chores).toHaveLength(1)
    expect(res.body.chores[0].id).toBe('chore-1')
  })

  it('requires authentication', async () => {
    const res = await request(app).get('/chores')
    expect(res.status).toBe(401)
  })
})

describe('POST /chores', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('requires admin mode token', async () => {
    const res = await request(app)
      .post('/chores')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ enc_name: 'enc-name', reward_amount: 2.5, recurrence_type: 'ad-hoc' })

    expect(res.status).toBe(403)
  })

  it('creates a chore definition with admin mode', async () => {
    const mockClient = await getMockClient()
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [sampleChore] }) // INSERT chore
      .mockResolvedValueOnce({ rows: [] }) // COMMIT

    const res = await request(app)
      .post('/chores')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_name: 'enc-take-out-trash', reward_amount: 2.5, recurrence_type: 'ad-hoc' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('chore-1')
    expect(res.body.recurrence_type).toBe('ad-hoc')
  })

  it('rejects an invalid recurrence_type', async () => {
    const res = await request(app)
      .post('/chores')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_name: 'enc-name', reward_amount: 2.5, recurrence_type: 'bad-type' })

    expect(res.status).toBe(400)
  })

  it('rejects a negative reward_amount', async () => {
    const res = await request(app)
      .post('/chores')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_name: 'enc-name', reward_amount: -1, recurrence_type: 'ad-hoc' })

    expect(res.status).toBe(400)
  })

  it('rejects missing required fields', async () => {
    const res = await request(app)
      .post('/chores')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_name: 'enc-name' })

    expect(res.status).toBe(400)
  })

  it('rejects eligible_kids from a different household', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] })

    const res = await request(app)
      .post('/chores')
      .set('Authorization', 'Bearer ' + makeAccessToken())
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({
        enc_name: 'enc-name',
        reward_amount: 2.5,
        recurrence_type: 'ad-hoc',
        eligible_kids: ['11111111-1111-4111-8111-111111111111'],
      })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('eligible_kids must reference kids in this household.')
  })
})

describe('PATCH /chores/:id', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('updates a chore definition with admin mode', async () => {
    const mockClient = await getMockClient()
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ ...sampleChore, enc_name: 'enc-updated-name' }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // SELECT eligible_kids
      .mockResolvedValueOnce({ rows: [] }) // COMMIT

    const res = await request(app)
      .patch('/chores/chore-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_name: 'enc-updated-name' })

    expect(res.status).toBe(200)
    expect(res.body.enc_name).toBe('enc-updated-name')
  })

  it('returns 404 when chore does not exist', async () => {
    const mockClient = await getMockClient()
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE (not found)
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK

    const res = await request(app)
      .patch('/chores/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_name: 'enc-name' })

    expect(res.status).toBe(404)
  })

  it('requires admin mode token', async () => {
    const res = await request(app)
      .patch('/chores/chore-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ enc_name: 'enc-name' })

    expect(res.status).toBe(403)
  })

  it('rejects an empty update body', async () => {
    const res = await request(app)
      .patch('/chores/chore-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({})

    expect(res.status).toBe(400)
  })

  it('rejects eligible_kids from a different household', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '0' }] })

    const res = await request(app)
      .patch('/chores/chore-1')
      .set('Authorization', 'Bearer ' + makeAccessToken())
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ eligible_kids: ['11111111-1111-4111-8111-111111111111'] })

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('eligible_kids must reference kids in this household.')
  })
})

describe('DELETE /chores/:id', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('soft-deletes a chore definition with admin mode', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'chore-1' }] })

    const res = await request(app)
      .delete('/chores/chore-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())

    expect(res.status).toBe(204)
  })

  it('returns 404 when chore does not exist', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .delete('/chores/nonexistent')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())

    expect(res.status).toBe(404)
  })

  it('requires admin mode token', async () => {
    const res = await request(app)
      .delete('/chores/chore-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
    expect(res.status).toBe(403)
  })
})

describe('POST /chores/:id/complete', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('completes an available chore and updates balance', async () => {
    const kidId = '11111111-1111-4111-8111-111111111111'
    const mockClient = await getMockClient()
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: kidId }] }) // kid lookup
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'chore-1',
            household_id: 'household-uuid',
            reward_amount: '2.50',
            recurrence_type: 'completion-based',
            enc_recurrence_rule: '2',
            eligible_kids: [kidId],
            is_active: true,
            last_completed_at: null,
          },
        ],
      }) // chore lookup
      .mockResolvedValueOnce({ rows: [{ completed_at: '2026-05-31T00:00:00.000Z' }] }) // completion insert
      .mockResolvedValueOnce({ rows: [{ balance: '5.00' }] }) // balance update
      .mockResolvedValueOnce({ rows: [] }) // COMMIT

    const res = await request(app)
      .post('/chores/chore-1/complete')
      .set('Authorization', 'Bearer ' + makeAccessToken())
      .send({ kid_id: kidId })

    expect(res.status).toBe(200)
    expect(res.body.reward_amount).toBe('2.50')
    expect(res.body.balance).toBe('5.00')
    expect(mockClient.query.mock.calls[2]?.[0]).toContain('FOR UPDATE OF cd')
  })

  it('rejects completion when chore is not currently available', async () => {
    const kidId = '11111111-1111-4111-8111-111111111111'
    const mockClient = await getMockClient()
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: kidId }] }) // kid lookup
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'chore-1',
            household_id: 'household-uuid',
            reward_amount: '2.50',
            recurrence_type: 'completion-based',
            enc_recurrence_rule: '3',
            eligible_kids: [kidId],
            is_active: true,
            last_completed_at: new Date().toISOString(),
          },
        ],
      }) // chore lookup
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK

    const res = await request(app)
      .post('/chores/chore-1/complete')
      .set('Authorization', 'Bearer ' + makeAccessToken())
      .send({ kid_id: kidId })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('This chore is not available yet.')
  })

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/chores/chore-1/complete')
      .send({ kid_id: '11111111-1111-4111-8111-111111111111' })

    expect(res.status).toBe(401)
  })
})
