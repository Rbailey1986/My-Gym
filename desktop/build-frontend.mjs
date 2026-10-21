#!/usr/bin/env node
// Builds the frontend's desktop flavour into frontend/dist-desktop for the Tauri shell, after
// build-catalogue.mjs has cut the exercise catalogue down to what can be done at home:
// the standalone phone build (VITE_MOBILE=1) with the desktop shims (VITE_DESKTOP=1), and the
// exercise media pointed at the media:// protocol that src-tauri/src/lib.rs serves from the
// install folder (http://media.localhost/ is how WebView2 spells a custom scheme).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../frontend')
const env = {
  ...process.env,
  VITE_MOBILE: '1',
  VITE_DESKTOP: '1',
  VITE_IMG_BASE: 'http://media.localhost/still/',
  VITE_GIF_BASE: 'http://media.localhost/clip/'
}
// The home-only catalogue and its media first: the Vite build aliases the generated modules.
const cat = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-catalogue.mjs')], { stdio: 'inherit' })
if (cat.status !== 0) process.exit(cat.status ?? 1)
const r = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-desktop', '--emptyOutDir'], { cwd: frontend, env, stdio: 'inherit', shell: true })
process.exit(r.status ?? 1)
