// One-off: download the full-resolution NASA/ESA Hubble plates used as the map
// zoom backdrops. The committed public/background1.png/2.png are kept for the
// home/lobby/loading screens; the in-game map backdrops are sourced here at full
// resolution (the committed PNGs were down-scaled, which softened the galaxy zoom).
//
// Run: node scripts/fetch-nasa-backgrounds.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(repoRoot, 'assets-raw/nasa-bg')
mkdirSync(outDir, { recursive: true })

// nasa_id -> local name (consumed by process-images.mjs / docs/CREDITS.md).
// Map imagery from the NASA images archive: zoom backdrops + galaxy/system
// node thumbnails.
const used = [
  // Backdrops
  ['GSFC_20171208_Archive_e000017', 'e000017'], // face-on spiral   → universe zoom
  ['GSFC_20171208_Archive_e000117', 'e000117'], // edge-on spiral   → galaxy zoom
  ['GSFC_20171208_Archive_e000159', 'e000159'], // calm deep field  → system zoom
  // Galaxy node thumbnails
  ['GSFC_20171208_Archive_e001979', 'e001979'], // grand-design spiral
  ['GSFC_20171208_Archive_e001708', 'e001708'], // spiral on starfield
  ['GSFC_20171208_Archive_e000158', 'e000158'], // barred spiral
  // System node thumbnails
  ['GSFC_20171208_Archive_e000390', 'e000390'], // emission nebula
  ['GSFC_20171208_Archive_e000433', 'e000433'], // nebula + stars
  ['PIA16022', 'PIA16022'] // nebula with jets
]
// Further candidates David picked (swap any above): 0301627, e000226, e000383,
// e002039, e001677, e001885, e001292, e001327, PIA17563, PIA16008, e000012.

async function assetFiles(id) {
  const r = await fetch(`https://images-api.nasa.gov/asset/${encodeURIComponent(id)}`)
  if (!r.ok) return []
  const j = await r.json()
  return (j.collection?.items || []).map(i => i.href).filter(h => /\.(jpg|jpeg|png)$/i.test(h))
}
const pick = f =>
  f.find(x => /~orig\./i.test(x)) || f.find(x => /~large\./i.test(x)) || f.find(x => /~medium\./i.test(x)) || f[0]

let ok = 0
for (const [id, name] of used) {
  try {
    const url = pick(await assetFiles(id))
    if (!url) {
      console.warn(`[bg] ${name}: no rendition for ${id}`)
      continue
    }
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[bg] ${name}: HTTP ${res.status}`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(resolve(outDir, `${name}.jpg`), buf)
    console.log(`[bg] ${name.padEnd(10)} <- ${id}  ${(buf.length / 1024).toFixed(0)} KB`)
    ok++
  } catch (err) {
    console.warn(`[bg] ${name}: ${err.message}`)
  }
}
console.log(`[bg] done: ${ok}/${used.length} into assets-raw/nasa-bg/`)
