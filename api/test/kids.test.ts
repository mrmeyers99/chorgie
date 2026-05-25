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
