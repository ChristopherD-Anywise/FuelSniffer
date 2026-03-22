import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Use 'postgres' (not 'pg') — required by Drizzle's postgres-js adapter.
// This client is a singleton: importing this module from multiple files
// is safe because Node.js module cache prevents re-initialisation.
const client = postgres(process.env.DATABASE_URL)

export const db = drizzle(client, { schema })
