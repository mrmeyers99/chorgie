import request from 'supertest'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
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

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('hashed_password')),
    compare: vi.fn(),
  },
}))

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

describe('POST /admin/enter', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
    vi.mocked(bcrypt.compare).mockReset()
    vi.mocked(bcrypt.compare).mockResolvedValue(true)
  })

  it('returns admin mode token for valid PIN', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [{ admin_pin_hash: 'stored-pin-hash' }],
    })

    const res = await request(app)
      .post('/admin/enter')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ pin: '1234' })

    expect(res.status).toBe(200)
    expect(res.body.adminModeToken).toEqual(expect.any(String))
    expect(res.body.expiresInSeconds).toBe(600)
    expect(bcrypt.compare).toHaveBeenCalledWith('1234', 'stored-pin-hash')
  })

  it('returns 403 for incorrect PIN', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [{ admin_pin_hash: 'stored-pin-hash' }],
    })
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false)

    const res = await request(app)
      .post('/admin/enter')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ pin: '1234' })

    expect(res.status).toBe(403)
  })
})

describe('POST /admin/exit', () => {
  it('returns 204', async () => {
    const res = await request(app)
      .post('/admin/exit')
      .set('Authorization', `Bearer ${makeAccessToken()}`)

    expect(res.status).toBe(204)
  })
})
