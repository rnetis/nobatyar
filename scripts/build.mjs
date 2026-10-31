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
 *
 * The 2026-10-12 deploy showed the other half of this: the host ran the build
 * against a tree with no node_modules *at all*, so there was nothing to resolve.
 * It copies only files that .gitignore does not exclude, and .gitignore excludes
 * node_modules, .next and .env — so neither the build nor `npm start` could ever
 * have worked on it. installDependencies() below installs what the build is
 * about to run when the host's own install step did not.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const require = createRequire(import.meta.url)

const PRISMA_ENTRY = 'prisma/build/index.js'
const NEXT_ENTRY = 'next/dist/bin/next'

/** Is a CLI resolvable from the project's node_modules, whatever pm layout installed it? */
function hasCli(entry) {
  try {
    require.resolve(entry, { paths: [projectRoot] })
    return true
  } catch {
    return false
  }
}

/** Run a command, echo its output, and return it (null when it could not even start). */
function capture(command, args) {
  console.log(`\n▶ ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.error) {
    console.warn(`[build] could not run ${command}: ${result.error.message}`)
    return null
  }
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) console.warn(`[build] ${command} ${args[0]} exited with code ${result.status}`)
  return `${result.stdout || ''}\n${result.stderr || ''}`
}

/**
 * Install dependencies when the host did not.
 *
 * `--include=dev` is deliberate: npm omits devDependencies when NODE_ENV is
 * production, and next build reads tailwindcss, @tailwindcss/postcss and
 * typescript from there — a prod-only install fails the build (or ships
 * unstyled HTML) on a host that exports NODE_ENV=production.
 */
function installDependencies() {
  if (hasCli(PRISMA_ENTRY) && hasCli(NEXT_ENTRY)) return

  console.warn('[build] node_modules has no prisma/next — installing dependencies before building.')
  const install = ['install', '--include=dev', '--no-audit', '--no-fund']
  let output = capture('npm', install)

  // npm's strict peer resolution rejects trees that pnpm/bun install happily.
  if (output !== null && /ERESOLVE|peer dep/i.test(output)) {
    console.warn('[build] npm reported a peer-dependency conflict — retrying with --legacy-peer-deps.')
    output = capture('npm', [...install, '--legacy-peer-deps'])
  }

  if (hasCli(PRISMA_ENTRY) && hasCli(NEXT_ENTRY)) {
    console.log('[build] dependencies installed.')
    return
  }
  throw new Error(
    'node_modules is still empty after `npm install`.\n' +
      "     the deploy host must allow network access during the build, or install\n" +
      "     dependencies in its own build step before `npm run build`.",
  )
}

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
  installDependencies()

  run(
    'prisma generate',
    resolveCli('prisma', PRISMA_ENTRY, 'run `npm install` (prisma is a runtime dependency)'),
    ['generate'],
  )

  run('next build', resolveCli('next', NEXT_ENTRY, 'run `npm install` so next is present'), ['build'])

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
