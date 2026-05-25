import { Pool } from 'pg'

function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }
  return new Pool({ connectionString: databaseUrl })
}

let _pool: Pool | null = null

export function getPool(): Pool {
  if (!_pool) {
    _pool = createPool()
  }
  return _pool
}

// Convenience re-export so existing imports keep working
export const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    return getPool()[prop as keyof Pool]
  },
})

export const connectToDatabase = async () => {
  await getPool().query('SELECT 1')
  console.info('Connected to PostgreSQL')
}
