/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Rspack loader for `locales/<lng>.json?core` and `?rest`. The console renders
// only once its locale has loaded, and the whole locale (8,000 keys, 146 KB
// brotli for zhCN) was the largest file a first visit waited for. The pages
// most visits land on (src/i18n/core-routes.ts) can render far fewer keys.
//
// `?core` keeps every key that a module reachable from those routes names as a
// string literal, and every key that no console source names: the server sends
// English messages for the console to translate, and a key built at run time
// matches no literal. `?rest` keeps the others, which only other pages name;
// those pages render once it has loaded (src/i18n/config.ts). Reachability
// follows static and dynamic imports, so a dialog a core page opens later is
// covered too. Outside production builds `?core` is the whole locale.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')
const ROUTES = path.join(SRC, 'routes')
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']
const IMPORT =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g
const LITERAL =
  /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`$\\]|\\.)*)`/g

function isSource(file) {
  return (
    EXTENSIONS.includes(path.extname(file)) && !/\.test\.|__tests__/.test(file)
  )
}

function sourceFiles(dir) {
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...sourceFiles(full))
    else if (isSource(full)) files.push(full)
  }
  return files
}

function resolveImport(from, specifier) {
  let base
  if (specifier.startsWith('@/')) {
    base = path.join(SRC, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(from), specifier)
  } else {
    return null
  }
  base = base.replace(/\?.*$/, '')
  const candidates = [
    base,
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => path.join(base, `index${e}`)),
  ]
  return (
    candidates.find((file) => isSource(file) && fs.existsSync(file)) ?? null
  )
}

// Route id -> route file, as TanStack's file routes name them: `__root__` is
// __root.tsx, an id ending in `/` is the directory's index.tsx.
function routeFile(id) {
  if (id === '__root__') return path.join(ROUTES, '__root.tsx')
  const relative = id.endsWith('/') ? `${id}index` : id
  return path.join(ROUTES, `${relative}.tsx`)
}

function coreRouteIds() {
  const text = fs.readFileSync(path.join(SRC, 'i18n', 'core-routes.ts'), 'utf8')
  const list = text.match(/CORE_ROUTE_IDS = \[([\s\S]*?)\]/)
  if (!list) {
    throw new Error('i18n-locale-split-loader: CORE_ROUTE_IDS not found')
  }
  return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

function unescapeLiteral(text) {
  return text.replaceAll(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c)
}

function literalsIn(files) {
  const names = new Set()
  for (const file of files) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(LITERAL)) {
      names.add(unescapeLiteral(m[1] ?? m[2] ?? m[3]))
    }
  }
  return names
}

// The modules the core routes can run: main.tsx, each core route file and the
// layout (`route.tsx`) of every directory above it, and everything they import.
// routeTree.gen.ts imports every route, so the walk does not enter it.
function coreModules() {
  const seen = new Set()
  const queue = [path.join(SRC, 'main.tsx')]
  for (const id of coreRouteIds()) {
    const file = routeFile(id)
    if (!fs.existsSync(file)) {
      throw new Error(`i18n-locale-split-loader: no route file for ${id}`)
    }
    queue.push(file)
    for (
      let dir = path.dirname(file);
      dir.startsWith(ROUTES) && dir !== ROUTES;
      dir = path.dirname(dir)
    ) {
      queue.push(path.join(dir, 'route.tsx'))
    }
  }
  while (queue.length > 0) {
    const file = queue.pop()
    if (seen.has(file) || !fs.existsSync(file)) continue
    seen.add(file)
    if (path.basename(file) === 'routeTree.gen.ts') continue
    for (const m of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const target = resolveImport(file, m[1] ?? m[2] ?? m[3])
      if (target) queue.push(target)
    }
  }
  return seen
}

/** The keys the core part keeps: named by core modules, or by no source at all. */
function coreKeys(translation) {
  const coreNames = literalsIn(coreModules())
  const allNames = literalsIn(sourceFiles(SRC))
  return new Set(
    Object.keys(translation).filter(
      (key) => coreNames.has(key) || !allNames.has(key)
    )
  )
}

function splitLocale(locale, part, keys) {
  const translation = {}
  for (const [key, value] of Object.entries(locale.translation)) {
    if (keys.has(key) === (part === 'core')) translation[key] = value
  }
  return { ...locale, translation }
}

let cachedKeys = null

export default function i18nLocaleSplitLoader(source) {
  const part = this.resourceQuery.includes('rest') ? 'rest' : 'core'
  const locale = JSON.parse(source)
  if (this.mode !== 'production') {
    return JSON.stringify(
      part === 'core' ? locale : { ...locale, translation: {} }
    )
  }
  // Every locale carries every key (locales.test.ts), so one partition, taken
  // from the first locale built, serves them all.
  cachedKeys ??= coreKeys(locale.translation)
  return JSON.stringify(splitLocale(locale, part, cachedKeys))
}
export { coreKeys, splitLocale }
