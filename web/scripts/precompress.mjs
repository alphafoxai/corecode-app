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
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

// Writes a brotli copy beside each text asset in dist/ so the Go server can
// send it to clients that accept br (middleware/frontend_static.go). The build
// is embedded in the binary and never changes at runtime, so the slowest,
// smallest quality is paid once here instead of per request.
const DIST_DIR = path.resolve('dist')
const EXTENSIONS = new Set(['.js', '.css', '.svg', '.json'])
const MIN_BYTES = 1024
const brotli = promisify(zlib.brotliCompress)

async function listAssets(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listAssets(full)
      return EXTENSIONS.has(path.extname(entry.name)) ? [full] : []
    })
  )
  return nested.flat()
}

const started = Date.now()
const assets = await listAssets(DIST_DIR)
let written = 0
let rawBytes = 0
let brotliBytes = 0
await Promise.all(
  assets.map(async (file) => {
    const raw = await fs.readFile(file)
    if (raw.length < MIN_BYTES) return
    const compressed = await brotli(raw, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    })
    // A copy that is not smaller would only cost space in the binary.
    if (compressed.length >= raw.length) return
    await fs.writeFile(`${file}.br`, compressed)
    written += 1
    rawBytes += raw.length
    brotliBytes += compressed.length
  })
)
console.log(
  `precompress: ${written} brotli files, ${(rawBytes / 1e6).toFixed(1)} MB -> ${(brotliBytes / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(1)}s`
)
