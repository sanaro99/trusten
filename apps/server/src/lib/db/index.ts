import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQL } from 'bun'

let db: SQL | null = null

export function initializeDb(databaseUrl = process.env.DATABASE_URL): SQL {
  if (db) return db
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required to initialize PostgreSQL')
  db = new SQL(databaseUrl)
  return db
}

export function getDb(): SQL {
  if (!db)
    throw new Error('Database not initialized. Call initializeDb() first.')
  return db
}

export async function migrateDb(
  migrationsDir = fileURLToPath(
    new URL('../../../migrations', import.meta.url),
  ),
): Promise<void> {
  const sql = getDb()
  const files = (await readdir(migrationsDir))
    .filter((f) => /^\d{3}_[a-z0-9][a-z0-9_-]*\.sql$/.test(f))
    .sort()
  const prefixes = files.map((file) => file.slice(0, 3))
  if (new Set(prefixes).size !== prefixes.length) {
    throw new Error('Migration numeric prefixes must be unique')
  }
  const migrations = await Promise.all(
    files.map(async (version) => {
      const source = await readFile(path.join(migrationsDir, version), 'utf8')
      const checksum = createHash('sha256').update(source).digest('hex')
      return { version, source, checksum }
    }),
  )

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(814005239)`
    await tx`CREATE TABLE IF NOT EXISTS trusten_schema_migrations (
      version text PRIMARY KEY,
      checksum char(64),
      applied_at timestamptz NOT NULL DEFAULT now()
    )`
    await tx`ALTER TABLE trusten_schema_migrations
      ADD COLUMN IF NOT EXISTS checksum char(64)`

    for (const { version, source, checksum } of migrations) {
      const [applied] = await tx`
        SELECT checksum FROM trusten_schema_migrations WHERE version = ${version}
      `
      if (applied) {
        if (applied.checksum == null) {
          await tx`UPDATE trusten_schema_migrations
            SET checksum = ${checksum} WHERE version = ${version}`
          continue
        }
        if (applied.checksum !== checksum) {
          throw new Error(`Applied migration checksum mismatch: ${version}`)
        }
        continue
      }
      await tx.unsafe(source)
      await tx`INSERT INTO trusten_schema_migrations (version, checksum)
        VALUES (${version}, ${checksum})`
    }
  })
}

export async function closeDb(): Promise<void> {
  if (!db) return
  const current = db
  db = null
  await current.close()
}
