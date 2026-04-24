/**
 * Database migration runner.
 * Discovers all *.sql files in the migrations directory and applies them
 * in lexicographic order, skipping files that have already been applied.
 *
 * Applied migrations are tracked in the schema_migrations table, which is
 * created automatically on first run. This means migrate.ts is safe to run
 * multiple times — subsequent runs are no-ops for already-applied files.
 *
 * IMPORTANT: Drizzle Kit is NOT used for TimescaleDB-specific DDL.
 * See src/lib/db/README.md for the reason.
 *
 * NOTE: backup-restore compat: pg_dump includes schema_migrations in the
 * dump, so restoring from a backup restores the tracking table too.
 * After a restore, migrate.ts will correctly skip all already-applied
 * migrations.
 *
 * Backward-compat: on a DB that was migrated through 0012 before this
 * tracking table existed, we detect the presence of the `stations` table
 * as a sentinel and bulk-insert 0000-0012 into schema_migrations before
 * processing 0013+ so they are not re-run.
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

/**
 * The legacy hardcoded list of migrations that were applied before the
 * schema_migrations tracking table was introduced. Used for backward
 * compatibility with production DBs that were migrated without tracking.
 */
const PRE_TRACKING_MIGRATIONS = [
  '0000_schema.sql',
  '0002_cagg.sql',
  '0003_invite_codes_sessions.sql',
  '0004_performance_indexes.sql',
  '0005_daily_aggregate.sql',
  '0006_enable_postgis.sql',
  '0007_provider_columns.sql',
  '0008_brand_aliases.sql',
  '0009_csp_violations.sql',
  '0010_waitlist_signups.sql',
  '0011_stations_geom.sql',
  '0012_route_cache.sql',
]

/**
 * Split a SQL string into individual statements on `;` boundaries,
 * but skip semicolons that appear inside dollar-quoted blocks ($$ ... $$).
 * This handles DO $$ BEGIN ... END $$; blocks correctly.
 */
function splitSql(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  // Stack of active dollar-quote tags (e.g. "$$", "$tag$")
  const dollarTagStack: string[] = []

  while (i < sql.length) {
    // Try to match a dollar-quote tag at the current position
    if (sql[i] === '$') {
      const end = sql.indexOf('$', i + 1)
      if (end !== -1) {
        const tag = sql.slice(i, end + 1)  // e.g. "$$" or "$body$"
        if (/^\$[A-Za-z0-9_]*\$$/.test(tag)) {
          if (dollarTagStack.length > 0 && dollarTagStack[dollarTagStack.length - 1] === tag) {
            // Closing tag — pop the stack
            dollarTagStack.pop()
          } else {
            // Opening tag — push onto stack
            dollarTagStack.push(tag)
          }
          current += tag
          i = end + 1
          continue
        }
      }
    }

    if (sql[i] === ';' && dollarTagStack.length === 0) {
      const stmt = current.trim()
      if (stmt.length > 0) statements.push(stmt)
      current = ''
      i++
    } else {
      current += sql[i]
      i++
    }
  }

  const remaining = current.trim()
  if (remaining.length > 0) statements.push(remaining)

  return statements
}

async function runMigrations(): Promise<void> {
  const sql = postgres(DATABASE_URL!, { max: 1 })
  try {
    // Step 1: Ensure the schema_migrations tracking table exists.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Step 2: Backward-compat — if the tracking table is empty and the
    // `stations` table already exists, this DB was migrated before tracking
    // was introduced. Mark 0000-0012 as applied without re-running them.
    const trackingCount = await sql`SELECT COUNT(*) AS cnt FROM schema_migrations`
    const isEmpty = Number(trackingCount[0]?.cnt ?? 0) === 0

    if (isEmpty) {
      const stationsExists = await sql`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'stations'
        LIMIT 1
      `
      if (stationsExists.length > 0) {
        console.log('Detected existing DB without migration tracking — backfilling 0000-0012 as already applied.')
        for (const filename of PRE_TRACKING_MIGRATIONS) {
          await sql`
            INSERT INTO schema_migrations (filename) VALUES (${filename})
            ON CONFLICT (filename) DO NOTHING
          `
        }
      }
    }

    // Step 3: Discover all migration files in lexicographic order.
    const allFiles = fs
      .readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    // Step 4: Find which files have already been applied.
    const applied = await sql`SELECT filename FROM schema_migrations`
    const appliedSet = new Set(applied.map((r: { filename: string }) => r.filename))

    const pending = allFiles.filter(f => !appliedSet.has(f))

    if (pending.length === 0) {
      console.log('0 pending migrations — nothing to do.')
      return
    }

    console.log(`${pending.length} pending migration(s) to apply.`)

    // Step 5: Apply each pending migration in order.
    for (const file of pending) {
      const filePath = path.join(migrationsDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      console.log(`Applying migration: ${file}`)

      // Split on semicolons and run each statement individually.
      // TimescaleDB continuous aggregates cannot run inside a transaction,
      // and postgres-js wraps multi-statement strings in a transaction.
      //
      // Dollar-quote-aware split: we track whether we're inside a $$ ... $$
      // block and only treat ';' as a statement delimiter when outside one.
      const statements = splitSql(content.replace(/--[^\n]*/g, ''))
      for (const stmt of statements) {
        await sql.unsafe(stmt)
      }

      // Record that this migration has been applied.
      await sql`
        INSERT INTO schema_migrations (filename) VALUES (${file})
        ON CONFLICT (filename) DO NOTHING
      `

      console.log(`  ✓ ${file} applied`)
    }

    console.log('All pending migrations applied successfully.')
  } finally {
    await sql.end()
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
