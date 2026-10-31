#!/usr/bin/env node
/**
 * Production start.
 *
 * `NODE_ENV=production node .next/standalone/server.js` assumed the build
 * artifact was present. When a deploy's build phase is skipped or aborts (the
 * `prisma: not found` case left no standalone output at all), that assumption
 * produced a bare MODULE_NOT_FOUND crash that said nothing about the real
 * problem. Two fixes here:
 *
 *  1. rebuild once when `.next/standalone/server.js` is missing, so a host whose
 *     build step never ran still boots — and if the rebuild fails, its error is
 *     what gets logged instead of "Cannot find module";
 *  2. mirror output to server.log *without* swallowing the exit code. The old
 *     `... | tee server.log` pipeline always exited 0, so a crashed server
 *     looked like a clean shutdown to the host's supervisor.
 */
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import path from 'node:path'
import { build, projectRoot } from './build.mjs'

const serverEntry = path.join(projectRoot, '.next', 'standalone', 'server.js')

if (!existsSync(serverEntry)) {
  console.warn('[start] .next/standalone/server.js is missing — building before startup.')
  try {
    build()
  } catch (error) {
    console.error(
      `[start] cannot start: ${error instanceof Error ? error.message : String(error)}\n` +
        '[start] the deploy build step did not produce a runnable artifact.',
    )
    process.exit(1)
  }
}

/**
 * Anchor a relative SQLite DATABASE_URL before it reaches the server: Prisma
 * resolves it against prisma/schema.prisma, which never holds the database, so
 * `file:./db/custom.db` fails at runtime. Walk up from the project root to
 * whichever directory actually contains the file and pass the absolute URL on.
 * This lookup lives here rather than in src/lib/db.ts because dynamic fs access
 * in server code makes the bundler ship the whole project in the artifact.
 */
function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith('file:')) return { url, found: true }

  const file = url.slice('file:'.length)
  if (!file || path.isAbsolute(file)) return { url, found: true }

  for (let dir = projectRoot; ; dir = path.dirname(dir)) {
    const candidate = path.resolve(dir, file)
    if (existsSync(candidate)) return { url: `file:${candidate}`, found: true }
    if (path.dirname(dir) === dir) break
  }
  return { url, found: false }
}

const databaseUrl = resolveDatabaseUrl()
if (databaseUrl.url && databaseUrl.url !== process.env.DATABASE_URL) {
  console.log(`[start] DATABASE_URL -> ${databaseUrl.url}`)
} else if (!databaseUrl.found) {
  console.warn(`[start] no SQLite file found for DATABASE_URL (${process.env.DATABASE_URL}) at or above ${projectRoot}`)
} else if (!databaseUrl.url) {
  // .env is gitignored, and this deploy host ships only non-ignored files — so
  // the app starts with none of them. Say which ones are missing instead of
  // letting every database route fail with a bare Prisma error.
  const missing = ['DATABASE_URL', 'SESSION_SECRET'].filter((name) => !process.env[name])
  if (missing.length) {
    console.warn(
      `[start] ${missing.join(' and ')} not set — .env is excluded from the deploy, so the`,
    )
    console.warn('[start]   host must provide these in its own environment (database routes and sign-in fail without them).')
  }
}

const log = createWriteStream(path.join(projectRoot, 'server.log'), { flags: 'a' })
log.write(`\n--- start ${new Date().toISOString()} ---\n`)

const child = spawn(process.execPath, [serverEntry], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
    ...(databaseUrl.url ? { DATABASE_URL: databaseUrl.url } : {}),
  },
  stdio: ['inherit', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk)
  log.write(chunk)
})
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk)
  log.write(chunk)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  console.error(`[start] failed to spawn the server: ${error.message}`)
  process.exit(1)
})

// Signal numbers for the shell convention (128 + n), so a supervisor that stops
// the service on purpose can tell that apart from a crash (exit 1) or success.
const SIGNAL_EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }

child.on('exit', (code, signal) => {
  if (signal) console.error(`[start] server terminated by ${signal}`)
  const exitCode = signal ? SIGNAL_EXIT_CODES[signal] || 1 : code || 0
  // Flush server.log before exiting: process.exit() would drop buffered writes.
  log.end(() => process.exit(exitCode))
})
