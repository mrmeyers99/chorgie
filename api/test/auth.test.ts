import request from 'supertest'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { app } from '../src/app.js'

// Mock the database pool so tests don't need a real Postgres connection
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

// Mock bcryptjs so tests are fast
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(() => Promise.resolve('hashed_password')),
    compare: vi.fn(),
  },
}))

process.env.JWT_SECRET = 'test-secret-for-unit-tests'

const validBody = {
  email: 'admin@example.com',
  password: 'password123',
  timezone: 'America/Chicago',
  currency_code: 'USD',
  enc_salt: 'base64encodedSalt==',
}

async function getMockClient() {
  const mod = await import('../src/db.js')
  // @ts-expect-error accessing internal mock
  return mod._mockClient as {
    query: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
  }
}

describe('POST /auth/register', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
    vi.mocked(bcrypt.compare).mockReset()
    vi.mocked(bcrypt.compare).mockResolvedValue(true)

    // Default: BEGIN, no existing user, household insert, user insert, COMMIT
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // SELECT existing user
      .mockResolvedValueOnce({ rows: [{ id: 'household-uuid' }] }) // INSERT household
      .mockResolvedValueOnce({ rows: [{ id: 'user-uuid' }] }) // INSERT user
      .mockResolvedValueOnce({}) // COMMIT
  })

  it('creates household and user, returns 201 with accessToken', async () => {
    const res = await request(app).post('/auth/register').send(validBody)

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      user: { id: 'user-uuid', email: 'admin@example.com' },
      household: { id: 'household-uuid', timezone: 'America/Chicago', currency_code: 'USD' },
    })
    expect(res.headers['set-cookie']).toBeDefined()
  })

  it('returns 400 for missing email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: undefined })

    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: 'not-an-email' })

    expect(res.status).toBe(400)
  })

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, password: 'short' })

    expect(res.status).toBe(400)
  })

  it('returns 409 when email already exists', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'existing-user' }] }) // existing user found
      .mockResolvedValueOnce({}) // ROLLBACK

    const res = await request(app).post('/auth/register').send(validBody)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/email already exists/i)
  })

  it('normalises email to lower-case', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...validBody, email: 'Admin@Example.COM' })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe('admin@example.com')
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockReset()
    mockClient.release.mockReset()
    vi.mocked(bcrypt.compare).mockReset()
    vi.mocked(bcrypt.compare).mockResolvedValue(true)
  })

  it('returns 200 with accessToken for valid credentials', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-uuid',
          email: 'admin@example.com',
          password_hash: 'stored-hash',
          household_id: 'household-uuid',
        },
      ],
    })

    const res = await request(app).post('/auth/login').send({
      email: 'Admin@Example.COM',
      password: 'password123',
    })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      user: { id: 'user-uuid', email: 'admin@example.com' },
    })
    expect(res.headers['set-cookie']).toBeDefined()
    expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
      'admin@example.com',
    ])
    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'stored-hash')
  })

  it('returns 401 when user does not exist', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({ rows: [] })

    const res = await request(app).post('/auth/login').send({
      email: 'missing@example.com',
      password: 'password123',
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalid email or password/i)
  })

  it('returns 401 when password is incorrect', async () => {
    const mockClient = await getMockClient()
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'user-uuid',
          email: 'admin@example.com',
          password_hash: 'stored-hash',
          household_id: 'household-uuid',
        },
      ],
    })
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false)

    const res = await request(app).post('/auth/login').send({
      email: 'admin@example.com',
      password: 'wrongpassword',
    })

    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/invalid email or password/i)
  })
})
