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

function makeExpiredAdminModeToken() {
  return jwt.sign(
    { sub: 'user-uuid', householdId: 'household-uuid', type: 'admin' },
    process.env.JWT_SECRET as string,
    { expiresIn: -1 }
  )
}

describe('GET /kids', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('returns kid profiles for the household', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'kid-1',
          enc_display_name: 'enc-name',
          avatar_id: 'corgi-1',
          sort_order: 0,
          balance: '0.00',
          is_active: true,
          created_at: '2026-05-25T00:00:00.000Z',
        },
      ],
    })

    const res = await request(app)
      .get('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.kids).toHaveLength(1)
  })
})

describe('POST /kids', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('requires admin mode token', async () => {
    const res = await request(app)
      .post('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ enc_display_name: 'enc-name', avatar_id: 'corgi-1' })

    expect(res.status).toBe(403)
  })

  it('creates a kid profile with admin mode', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'kid-1',
          enc_display_name: 'enc-name',
          avatar_id: 'corgi-1',
          sort_order: 0,
          balance: '0.00',
          is_active: true,
          created_at: '2026-05-25T00:00:00.000Z',
        },
      ],
    })

    const res = await request(app)
      .post('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ enc_display_name: 'enc-name', avatar_id: 'corgi-1' })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe('kid-1')
  })

  it('rejects malformed admin mode token', async () => {
    const res = await request(app)
      .post('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', 'not-a-jwt')
      .send({ enc_display_name: 'enc-name', avatar_id: 'corgi-1' })

    expect(res.status).toBe(403)
  })

  it('rejects expired admin mode token', async () => {
    const res = await request(app)
      .post('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeExpiredAdminModeToken())
      .send({ enc_display_name: 'enc-name', avatar_id: 'corgi-1' })

    expect(res.status).toBe(403)
  })

  it('rejects admin mode token with wrong user or household claims', async () => {
    const res = await request(app)
      .post('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set(
        'x-admin-mode-token',
        jwt.sign(
          { sub: 'different-user', householdId: 'different-household', type: 'admin' },
          process.env.JWT_SECRET as string,
          { expiresIn: '10m' }
        )
      )
      .send({ enc_display_name: 'enc-name', avatar_id: 'corgi-1' })

    expect(res.status).toBe(403)
  })

  it('rejects non-admin token in admin mode header', async () => {
    const res = await request(app)
      .post('/kids')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set(
        'x-admin-mode-token',
        jwt.sign(
          { sub: 'user-uuid', householdId: 'household-uuid', type: 'refresh' },
          process.env.JWT_SECRET as string,
          { expiresIn: '10m' }
        )
      )
      .send({ enc_display_name: 'enc-name', avatar_id: 'corgi-1' })

    expect(res.status).toBe(403)
  })
})

describe('DELETE /kids/:id', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('requires admin mode token', async () => {
    const res = await request(app)
      .delete('/kids/kid-1')
      .set('Authorization', 'Bearer ' + makeAccessToken())

    expect(res.status).toBe(403)
  })

  it('deactivates a kid profile with admin mode', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'kid-1' }] })

    const res = await request(app)
      .delete('/kids/kid-1')
      .set('Authorization', 'Bearer ' + makeAccessToken())
      .set('x-admin-mode-token', makeAdminModeToken())

    expect(res.status).toBe(204)
  })

  it('returns 404 when kid not found', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .delete('/kids/nonexistent')
      .set('Authorization', 'Bearer ' + makeAccessToken())
      .set('x-admin-mode-token', makeAdminModeToken())

    expect(res.status).toBe(404)
  })
})

describe('PATCH /kids/:id', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('updates a kid profile with admin mode', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'kid-1',
          enc_display_name: 'enc-name-2',
          avatar_id: 'corgi-2',
          sort_order: 1,
          balance: '1.25',
          is_active: true,
          created_at: '2026-05-25T00:00:00.000Z',
        },
      ],
    })

    const res = await request(app)
      .patch('/kids/kid-1')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .set('x-admin-mode-token', makeAdminModeToken())
      .send({ avatar_id: 'corgi-2', sort_order: 1 })

    expect(res.status).toBe(200)
    expect(res.body.avatar_id).toBe('corgi-2')
  })
})

describe('GET /kids/:id/completions', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/kids/kid-1/completions')

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID format', async () => {
    const res = await request(app)
      .get('/kids/not-a-uuid/completions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid kid ID format.')
  })

  it('returns 404 when kid not found in household', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app)
      .get('/kids/00000000-0000-0000-0000-000000000000/completions')
      .set('Authorization', `Bearer ${makeAccessToken()}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Kid profile not found.')
  })

  it('returns completions with expected shape and order', async () => {
    const mockClient = await getMockClient()
    const kidId = '11111111-1111-1111-1111-111111111111'
    // Mock kid verification
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: kidId }] })
    // Mock completions query
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'completion-2',
          chore_id: 'chore-1',
          chore_name: 'enc-chore-2',
          reward_amount: '5.00',
          completed_at: '2026-05-26T00:00:00.000Z',
        },
        {
          id: 'completion-1',
          chore_id: 'chore-1',
          chore_name: 'enc-chore-1',
          reward_amount: '2.50',
          completed_at: '2026-05-25T00:00:00.000Z',
        },
      ],
    })

    const res = await request(app)
      .get(`/kids/${kidId}/completions`)
      .set('Authorization', `Bearer ${makeAccessToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.completions).toHaveLength(2)
    expect(res.body.completions[0].id).toBe('completion-2')
    expect(res.body.completions[0].chore_name).toBe('enc-chore-2')
    expect(res.body.completions[1].id).toBe('completion-1')
  })
})
