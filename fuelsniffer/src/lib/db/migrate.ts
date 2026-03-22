/**
 * Database migration runner.
 * Applies SQL files in 0000 → 0001 → 0002 order.
 *
 * IMPORTANT: Drizzle Kit is NOT used for TimescaleDB-specific DDL.
 * See src/lib/db/README.md for the reason.
 *
 * Usage: npx tsx src/lib/db/migrate.ts
 */
import postgres from 'postgres'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const migrationsDir = path.join(__dirname, 'migrations')
const files = ['0000_schema.sql', '0001_hypertable.sql', '0002_cagg.sql']

async function runMigrations(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { max: 1 })
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      console.log(`Applying migration: ${file}`)
      await sql.unsafe(content)
      console.log(`  ✓ ${file} applied`)
    }
    console.log('All migrations applied successfully.')
  } finally {
    await sql.end()
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
