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
const files = ['0000_schema.sql', '0001_hypertable.sql', '0002_cagg.sql', '0003_invite_codes_sessions.sql', '0004_performance_indexes.sql']

async function runMigrations(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { max: 1 })
  try {
    for (const file of files) {
      const filePath = path.join(migrationsDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      console.log(`Applying migration: ${file}`)
      // Split on semicolons and run each statement individually.
      // TimescaleDB continuous aggregates cannot run inside a transaction,
      // and postgres-js wraps multi-statement strings in a transaction.
      const statements = content
        .split(';')
        .map(s => s.replace(/^(\s*--[^\n]*\n)*/g, '').trim())
        .filter(s => s.length > 0)
      for (const stmt of statements) {
        await sql.unsafe(stmt)
      }
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
