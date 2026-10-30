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
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// Fails when oxlint reports more of a rule in a file than lint-baseline.json
// allows. The upstream new-api console does not lint clean, and fixing its files
// here would conflict on every upstream sync, so the baseline records what the
// merged upstream tree already carries and CI rejects only what is new.
//
//   node scripts/check-lint-baseline.mjs           compare with the baseline
//   node scripts/check-lint-baseline.mjs --update  rewrite it, after an upstream
//                                                  sync or a fix that removes entries
const BASELINE = path.resolve('lint-baseline.json')

let output
try {
  output = execFileSync(
    'oxlint',
    ['-c', '.oxlintrc.json', '--format', 'json', '.'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
} catch (error) {
  // oxlint exits 1 when it reports an error; its JSON is still on stdout.
  if (!error.stdout) throw error
  output = error.stdout
}

const counts = {}
for (const { filename, code } of JSON.parse(output).diagnostics) {
  counts[filename] ??= {}
  counts[filename][code] = (counts[filename][code] ?? 0) + 1
}

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(
    Object.keys(counts)
      .sort()
      .map((file) => [
        file,
        Object.fromEntries(Object.entries(counts[file]).sort()),
      ])
  )
  fs.writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`)
  console.log(`check-lint-baseline: wrote ${Object.keys(sorted).length} files`)
  process.exit(0)
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
const added = []
let removed = 0
for (const [file, rules] of Object.entries(counts)) {
  for (const [rule, count] of Object.entries(rules)) {
    const allowed = baseline[file]?.[rule] ?? 0
    if (count > allowed) added.push(`${file}: ${rule} ${allowed} -> ${count}`)
  }
}
for (const [file, rules] of Object.entries(baseline)) {
  for (const [rule, allowed] of Object.entries(rules)) {
    if ((counts[file]?.[rule] ?? 0) < allowed) removed += 1
  }
}

if (added.length > 0) {
  console.error(
    'check-lint-baseline: new lint findings; run `bun run lint` and fix them:'
  )
  for (const line of added) console.error(`  ${line}`)
  process.exit(1)
}
if (removed > 0) {
  console.log(
    `check-lint-baseline: ${removed} baseline entries no longer occur; run with --update to tighten it`
  )
}
console.log('check-lint-baseline: no new lint findings')
