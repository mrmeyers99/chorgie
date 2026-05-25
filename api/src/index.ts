import { app } from './app.js'
import { connectToDatabase } from './db.js'

const PORT = Number(process.env.PORT ?? 3000)

const startServer = async () => {
  await connectToDatabase()

  app.listen(PORT, () => {
    console.info(`API listening on port ${PORT}`)
  })
}

void startServer().catch((error: unknown) => {
  console.error('Failed to start API', error)
  process.exit(1)
})
