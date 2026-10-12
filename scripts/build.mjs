#!/usr/bin/env node
/**
 * Deployment-safe production build.
 *
 * Deploy hosts often run the build through a bare `sh -c` (no npm PATH
 * injection), so the old `prisma generate && next build && cp ...` chain died on
 * its very first command with `sh: 1: prisma: not found`. Because the chain was
 * joined with `&&`, `next build` never ran, the artifact shipped without
 * `.next/standalone/server.js`, and the start command crashed with a bare
 * MODULE_NOT_FOUND long before Next booted.
 *
 * Resolving both CLIs through Node's module resolver instead of $PATH, plus an
 * explicit check for the standalone entry point, means the build either
 * completes or exits non-zero naming the missing piece — it can no longer
 * "succeed" while producing nothing runnable.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const require = createRequire(import.meta.url)

/** Resolve a CLI inside node_modules, independent of $PATH and of npm/pnpm layouts. */
function resolveCli(packageName, entry, howToFix) {
  try {
    return require.resolve(entry, { paths: [projectRoot] })
  } catch {
    throw new Error(
      `cannot find the "${packageName}" CLI inside node_modules.\n` +
        `     the dependency install did not finish: ${howToFix}`,
    )
  }
}

function run(label, cliPath, args) {
  console.log(`\n▶ ${label}`)
  const result = spawnSync(process.execPath, [cliPath, ...args], { cwd: projectRoot, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} exited with code ${result.status}`)
}

function countFiles(dir) {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(dir, entry.name)) : 1
  }
  return total
}

/** Replace `to` with a fresh copy of `from`; returns the number of files, or null if `from` is absent. */
function copyInto(from, to) {
  if (!existsSync(from)) return null
  rmSync(to, { recursive: true, force: true })
  mkdirSync(path.dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  return countFiles(to)
}

export function build() {
  run(
    'prisma generate',
    resolveCli('prisma', 'prisma/build/index.js', 'run `npm install` (prisma is a runtime dependency)'),
    ['generate'],
  )

  run('next build', resolveCli('next', 'next/dist/bin/next', 'run `npm install` so next is present'), ['build'])

  const standalone = path.join(projectRoot, '.next', 'standalone')
  const serverEntry = path.join(standalone, 'server.js')
  if (!existsSync(serverEntry)) {
    throw new Error(
      'next build finished but .next/standalone/server.js is missing.\n' +
        '     check that next.config.ts still sets output: "standalone" — the deploy host\n' +
        '     starts `node .next/standalone/server.js`, so without it startup fails instantly.',
    )
  }

  // Standalone output deliberately excludes the client assets and public/.
  const staticFiles = copyInto(path.join(projectRoot, '.next', 'static'), path.join(standalone, '.next', 'static'))
  const publicFiles = copyInto(path.join(projectRoot, 'public'), path.join(standalone, 'public'))

  console.log('\n✅ Build complete')
  console.log(`   entry  : .next/standalone/server.js (${(statSync(serverEntry).size / 1024).toFixed(1)} KB)`)
  console.log(`   assets : .next/static ${staticFiles === null ? 'MISSING' : `${staticFiles} files`}, public/ ${publicFiles === null ? 'MISSING' : `${publicFiles} files`}`)
  console.log('   run    : node .next/standalone/server.js')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    build()
  } catch (error) {
    console.error(`\n❌ Build failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
