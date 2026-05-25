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

describe('GET /household', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/household')

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/unauthorized/i)
  })

  it('returns household settings for authorized user', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'household-uuid',
          timezone: 'America/Chicago',
          currency_code: 'USD',
          enc_salt: 'base64encodedSalt==',
        },
      ],
    })

    const res = await request(app)
      .get('/household')
      .set('Authorization', `Bearer ${makeAccessToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'household-uuid',
      timezone: 'America/Chicago',
      currency_code: 'USD',
      enc_salt: 'base64encodedSalt==',
    })
  })
})

describe('PATCH /household', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
  })

  it('returns 400 when payload is empty', async () => {
    const res = await request(app)
      .patch('/household')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it('updates household settings for authorized user', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'household-uuid',
          timezone: 'America/New_York',
          currency_code: 'USD',
          enc_salt: 'base64encodedSalt==',
        },
      ],
    })

    const res = await request(app)
      .patch('/household')
      .set('Authorization', `Bearer ${makeAccessToken()}`)
      .send({ timezone: 'America/New_York' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: 'household-uuid',
      timezone: 'America/New_York',
      currency_code: 'USD',
      enc_salt: 'base64encodedSalt==',
    })
    expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
      'household-uuid',
      'America/New_York',
      null,
    ])
  })
})
