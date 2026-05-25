import { Pool } from 'pg'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

export const pool = new Pool({
  connectionString: databaseUrl,
})

export const connectToDatabase = async () => {
  await pool.query('SELECT 1')
  console.info('Connected to PostgreSQL')
}
