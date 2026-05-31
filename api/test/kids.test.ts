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
