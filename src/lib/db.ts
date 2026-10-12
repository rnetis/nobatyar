import { PrismaClient } from '@prisma/client'
import path from 'node:path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma resolves a relative SQLite `file:` URL against prisma/schema.prisma, so
 * `file:./db/custom.db` is looked up as prisma/db/custom.db — a path that exists
 * nowhere: not in dev, and not in the standalone deployment build, where the
 * server has chdir'd into .next/standalone. The app then boots but answers every
 * database call with "Error code 14: Unable to open the database file".
 *
 * Anchor a relative path to the app root instead: the project root in dev, two
 * levels above .next/standalone in a deployment. scripts/start.mjs resolves it
 * to an absolute path before startup whenever the database can be located.
 * Absolute URLs and non-file datasources such as Postgres pass through.
 *
 * Keep this free of filesystem calls: the bundler statically traces any dynamic
 * fs access in server code and ships the entire project with it.
 */
function resolveDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith('file:')) return url

  const file = url.slice('file:'.length)
  if (!file || path.isAbsolute(file)) return url

  const cwd = process.cwd()
  const appRoot = cwd.endsWith(path.join('.next', 'standalone')) ? path.resolve(cwd, '..', '..') : cwd
  return `file:${path.resolve(appRoot, file)}`
}

const databaseUrl = resolveDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
