// One-off: download the distinct full-disk planet stills used as planet textures.
// The bulk NASA set (fetch-nasa-images.mjs) is heavy on Mars + Sun, so the six
// planet types are sourced from these hand-picked iconic public-domain images
// via the NASA images asset endpoint (resolves the real rendition URL by id).
//
// Run: node scripts/fetch-nasa-planets.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(repoRoot, 'assets-raw/nasa-extra')
mkdirSync(outDir, { recursive: true })

// nasa_id -> local name (consumed by process-images.mjs / docs/CREDITS.md)
const planets = [
  ['as17-148-22727', 'earth_bluemarble'], // Apollo 17 Blue Marble  → terrestrial
  ['PIA01492', 'neptune_full'], // Voyager 2 Neptune       → oceanic
  ['PIA18182', 'uranus_voyager'], // Voyager 2 Uranus        → ice-giant
  ['PIA02873', 'jupiter_cassini'] // Cassini Jupiter         → gas-giant
]

async function assetFiles(id) {
  const r = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(id)}`)
  if (!r.ok) return []
  const j = await r.json()
  return (j.collection?.items || []).map(i => i.href).filter(h => /\.(jpg|jpeg|png)$/i.test(h))
}

const pick = files =>
  files.find(f => /~orig\./i.test(f))
  || files.find(f => /~large\./i.test(f))
  || files.find(f => /~medium\./i.test(f))
  || files[0]

let ok = 0
for (const [id, name] of planets) {
  try {
    const url = pick(await assetFiles(id))
    if (!url) {
      console.warn(`[planets] ${name}: no rendition for ${id}`)
      continue
    }
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[planets] ${name}: HTTP ${res.status}`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(resolve(outDir, `${name}.jpg`), buf)
    console.log(`[planets] ${name.padEnd(18)} <- ${id}  ${(buf.length / 1024).toFixed(0)} KB`)
    ok++
  } catch (err) {
    console.warn(`[planets] ${name}: ${err.message}`)
  }
}
console.log(`[planets] done: ${ok}/${planets.length} into assets-raw/nasa-extra/`)
