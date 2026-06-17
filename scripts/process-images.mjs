// Turn the curated raw sources (assets-raw/) into optimised WebP assets under
// public/. Re-runnable. Sources are listed by filename so there is no index
// ambiguity. Keep the type->source mapping in sync with docs/CREDITS.md.
//
// Run: node scripts/process-images.mjs

import { mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const nasa = id => resolve(repoRoot, 'assets-raw/nasa-dl', `${id}.jpg`)
const extra = id => resolve(repoRoot, 'assets-raw/nasa-extra', `${id}.jpg`)
const scope = id => resolve(repoRoot, 'assets-raw/aufnahmen', `${id}.jpg`)
const bg = id => resolve(repoRoot, 'assets-raw/nasa-bg', `${id}.jpg`) // full-res Hubble plates (fetch-nasa-backgrounds.mjs)
const out = rel => resolve(repoRoot, 'public', rel)

// A circular disk (planet/galaxy/system node) is centred on its source frame,
// so crop from the centre — never 'attention' (that pulls bright limbs off-axis).
const DISK = (size, q = 82) => ({ width: size, height: size, fit: 'cover', position: 'centre', quality: q })
// Backdrops: centre crop (no attention zoom), high quality so the dense star
// fields don't turn blocky under WebP compression.
const WIDE = (w, h, q = 88) => ({ width: w, height: h, fit: 'cover', position: 'centre', quality: q })

// Find the bright disk's square crop so every planet/sun disk fills its frame
// identically. Uses the bright pixels' centroid + an area-based radius (area =
// π·r²) rather than a bounding box, so a stray solar prominence/flare doesn't
// widen the box and shrink the disk (e001435 sun was only 83% tall that way).
// Scans an aspect-preserving proxy, then maps back to source pixels.
async function diskBox(src) {
  const { width: W, height: H } = await sharp(src).metadata()
  const { data, info } = await sharp(src).resize(240, 240, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: pw, height: ph, channels: C } = info
  const TH = 24
  let count = 0, sumx = 0, sumy = 0
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * C
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (lum > TH) {
        count++
        sumx += x
        sumy += y
      }
    }
  }
  if (!count) return { left: 0, top: 0, width: W, height: H }
  const sx = W / pw, sy = H / ph
  const cx = (sumx / count) * sx, cy = (sumy / count) * sy
  const radius = Math.sqrt(count / Math.PI) * ((sx + sy) / 2)
  let side = Math.round(radius * 2 * 1.06) // 6% padding around the disk
  let left = Math.round(cx - side / 2)
  let top = Math.round(cy - side / 2)
  if (left < 0) left = 0
  if (top < 0) top = 0
  if (left + side > W) side = W - left
  if (top + side > H) side = H - top
  return { left, top, width: side, height: side }
}

// Backdrop scrim: darken overall + vignette the edges so map UI/labels stay
// legible. `strong` is for the system zoom, whose foreground (sun + planets)
// needs the backdrop to recede further.
const scrim = (w, h, strong = false) => {
  const s = strong ? ['0.50', '0.62', '0.90'] : ['0.32', '0.46', '0.82']
  return Buffer.from(
    `<svg width="${w}" height="${h}"><defs><radialGradient id="v" cx="50%" cy="50%" r="75%">`
    + `<stop offset="0%" stop-color="rgba(0,0,0,${s[0]})"/>`
    + `<stop offset="55%" stop-color="rgba(0,0,0,${s[1]})"/>`
    + `<stop offset="100%" stop-color="rgba(0,0,0,${s[2]})"/></radialGradient></defs>`
    + `<rect width="${w}" height="${h}" fill="url(#v)"/></svg>`
  )
}

const jobs = [
  // ── Planet textures by Planet.type — each a distinct real body. `disk` squares
  //    the crop to the bright disk's bounding box so every planet fills its frame
  //    identically; same Planet.size then renders at the same on-screen diameter. ──
  { src: extra('earth_bluemarble'), dest: 'planets/terrestrial.webp', ...DISK(512), disk: true }, // Earth (Apollo 17)
  { src: extra('neptune_full'), dest: 'planets/oceanic.webp', ...DISK(512), disk: true }, // Neptune deep blue
  { src: extra('uranus_voyager'), dest: 'planets/ice-giant.webp', ...DISK(512), disk: true }, // Uranus pale cyan
  { src: extra('jupiter_cassini'), dest: 'planets/gas-giant.webp', ...DISK(512), disk: true }, // Jupiter bands
  { src: nasa('PIA01590'), dest: 'planets/desert.webp', ...DISK(512), disk: true }, // Mars red
  { src: nasa('PIA21906'), dest: 'planets/barren.webp', ...DISK(512), disk: true }, // grey cratered moon

  // ── Sun — a complete SDO disk (e001435 has black margin so it crops to a clean
  //    circle). Rendered like a planet (opaque disk + map ring); CSS adds the glow. ──
  { src: nasa('GSFC_20171208_Archive_e001435'), dest: 'sun.webp', ...DISK(512), disk: true },

  // ── Galaxy node thumbnails (cycled by id) — telescope astrophotography + NASA ──
  { src: nasa('PIA12000'), dest: 'galaxies/0.webp', ...DISK(560) },
  { src: scope('1763761124896'), dest: 'galaxies/1.webp', ...DISK(560) }, // Andromeda (telescope)
  { src: scope('1766689243397'), dest: 'galaxies/2.webp', ...DISK(560) }, // telescope
  { src: bg('e001979'), dest: 'galaxies/3.webp', ...DISK(560) }, // grand-design spiral (Hubble)
  { src: bg('e001708'), dest: 'galaxies/4.webp', ...DISK(560) }, // spiral on starfield (Hubble)
  { src: bg('e000158'), dest: 'galaxies/5.webp', ...DISK(560) }, // barred spiral (Hubble)

  // ── System node thumbnails / nebulae (cycled by id) — telescope + NASA ──
  { src: scope('1763759864688'), dest: 'systems/0.webp', ...DISK(560) }, // Orion (telescope)
  { src: scope('1766776139741'), dest: 'systems/1.webp', ...DISK(560) }, // telescope
  { src: scope('1766777851959'), dest: 'systems/2.webp', ...DISK(560) }, // telescope
  { src: bg('e000390'), dest: 'systems/3.webp', ...DISK(560) }, // emission nebula (Hubble)
  { src: bg('e000433'), dest: 'systems/4.webp', ...DISK(560) }, // nebula + stars (Hubble)
  { src: bg('PIA16022'), dest: 'systems/5.webp', ...DISK(560) }, // nebula with jets (Hubble)

  // ── Backdrops per zoom level — full-res NASA/ESA Hubble plates, down-scaled
  //    (never up-scaled) with a scrim baked in for UI legibility. ──
  { src: bg('e000017'), dest: 'space/universe.webp', ...WIDE(2560, 1440), darken: true }, // face-on spiral
  { src: bg('e000117'), dest: 'space/galaxy.webp', ...WIDE(2560, 1440), darken: true }, // edge-on spiral + dust lane
  { src: bg('e000159'), dest: 'space/system.webp', ...WIDE(2560, 1440), darken: 'strong' } // calm deep field (sun + planets sit on top)
]

for (const d of ['planets', 'galaxies', 'systems', 'space']) mkdirSync(out(d), { recursive: true })

let total = 0
for (const job of jobs) {
  let img = sharp(job.src)

  if (job.disk) {
    // Square-crop to the bright disk so all disks fill their frame equally.
    img = img.extract(await diskBox(job.src))
  }

  img = img.resize(job.width, job.height, { fit: job.fit, position: job.position })

  if (job.darken) {
    img = img.composite([{ input: scrim(job.width, job.height, job.darken === 'strong'), blend: 'over' }])
  }

  const info = await img.webp({ quality: job.quality }).toFile(out(job.dest))
  total += info.size
  console.log(`${job.dest.padEnd(26)} ${(info.size / 1024).toFixed(0).padStart(4)} KB  ${info.width}x${info.height}`)
}
console.log(`\nTotal: ${(total / 1024).toFixed(0)} KB across ${jobs.length} assets`)
