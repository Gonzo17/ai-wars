// One-off: download the NASA stills referenced in assets-raw/nasa.txt.
// Reads detail-page or asset URLs, extracts the NASA image id, and pulls the
// `~large` rendition (falls back to `~orig`) into assets-raw/nasa-dl/<id>.jpg.
//
// NASA still imagery is generally public domain (verify per image; exclude
// logos/insignia). Run: node scripts/fetch-nasa-images.mjs

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const listPath = resolve(repoRoot, 'assets-raw/nasa.txt')
const outDir = resolve(repoRoot, 'assets-raw/nasa-dl')
mkdirSync(outDir, { recursive: true })

const ids = new Set()
for (const raw of readFileSync(listPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.includes('/search?')) continue
  let m = line.match(/\/details\/([^/?#]+)/) || line.match(/\/image\/([^/]+)\//)
  if (m) ids.add(decodeURIComponent(m[1]))
}

console.log(`[nasa] ${ids.size} unique image ids`)

async function tryDownload(id, rendition) {
  const url = `https://images-assets.nasa.gov/image/${id}/${id}~${rendition}.jpg`
  const res = await fetch(url)
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 1024) return false
  writeFileSync(resolve(outDir, `${id}.jpg`), buf)
  console.log(`[nasa] ${id} (${rendition}) → ${(buf.length / 1024).toFixed(0)} KB`)
  return true
}

let ok = 0
for (const id of ids) {
  const dest = resolve(outDir, `${id}.jpg`)
  if (existsSync(dest)) {
    ok++
    continue
  }
  try {
    if (await tryDownload(id, 'large') || await tryDownload(id, 'orig')) ok++
    else console.warn(`[nasa] ${id}: no rendition found`)
  } catch (err) {
    console.warn(`[nasa] ${id}: ${err.message}`)
  }
}

console.log(`[nasa] done: ${ok}/${ids.size} downloaded into assets-raw/nasa-dl/`)
