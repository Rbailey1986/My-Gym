#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync, cpSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootDir = path.resolve(frontendDir, '..')

const env = { ...process.env, VITE_MOBILE: '1' }

function run(cmd, args, cwd = frontendDir, useShell = false) {
  const res = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: useShell })
  if (res.status !== 0) {
    process.exit(res.status ?? 1)
  }
}

console.log('Building mobile frontend...')
run('npx', ['vite', 'build'], frontendDir, true)

console.log('Staging catalogue media...')
run(process.execPath, [path.join(rootDir, 'scripts', 'catalogue', 'stage-media.mjs'), 'dist'], frontendDir, false)

console.log('Syncing Capacitor platforms...')
run('npx', ['cap', 'sync'], frontendDir, true)

console.log('Verifying mobile bundle...')
run(process.execPath, [path.join(frontendDir, 'scripts', 'check-mobile-bundle.mjs')], frontendDir, false)

const xtoolWeb = path.join(rootDir, 'ios-xtool', 'Sources', 'Web')
if (existsSync(path.join(rootDir, 'ios-xtool', 'Sources'))) {
  console.log('Syncing web assets to ios-xtool/Sources/Web...')
  rmSync(xtoolWeb, { recursive: true, force: true })
  mkdirSync(xtoolWeb, { recursive: true })
  cpSync(path.join(frontendDir, 'dist'), xtoolWeb, { recursive: true })
  console.log('ios-xtool web bundle ready.')
}
