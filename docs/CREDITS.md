# Image credits

All map imagery is real. Processed assets live under `public/` (see
`scripts/process-images.mjs` for the source→asset mapping); raw originals are
kept out of git under `assets-raw/`.

## NASA (public domain)

NASA still images are generally in the public domain (per
<https://www.nasa.gov/nasa-brand-center/images-and-media/>). Each asset links to
its NASA Images detail page for verification.

| Asset | Source | Detail page |
|---|---|---|
| `planets/terrestrial.webp` | Earth — Apollo 17 "Blue Marble" (as17-148-22727) | https://images.nasa.gov/details/as17-148-22727 |
| `planets/oceanic.webp` | Neptune — Voyager 2 (PIA01492) | https://images.nasa.gov/details/PIA01492 |
| `planets/ice-giant.webp` | Uranus — Voyager 2 (PIA18182) | https://images.nasa.gov/details/PIA18182 |
| `planets/gas-giant.webp` | Jupiter — Cassini (PIA02873) | https://images.nasa.gov/details/PIA02873 |
| `planets/desert.webp` | Mars (PIA01590) | https://images.nasa.gov/details/PIA01590 |
| `planets/barren.webp` | Tethys — Cassini (PIA21906) | https://images.nasa.gov/details/PIA21906 |
| `sun.webp` | Sun — SDO (GSFC_20171208_Archive_e001435) | https://images.nasa.gov/details/GSFC_20171208_Archive_e001435 |
| `galaxies/0.webp` | Galaxy (PIA12000) | https://images.nasa.gov/details/PIA12000 |
| `galaxies/3.webp` | Grand-design spiral — Hubble (GSFC_20171208_Archive_e001979) | https://images.nasa.gov/details/GSFC_20171208_Archive_e001979 |
| `galaxies/4.webp` | Spiral galaxy — Hubble (GSFC_20171208_Archive_e001708) | https://images.nasa.gov/details/GSFC_20171208_Archive_e001708 |
| `galaxies/5.webp` | Barred spiral — Hubble (GSFC_20171208_Archive_e000158) | https://images.nasa.gov/details/GSFC_20171208_Archive_e000158 |
| `systems/3.webp` | Emission nebula — Hubble (GSFC_20171208_Archive_e000390) | https://images.nasa.gov/details/GSFC_20171208_Archive_e000390 |
| `systems/4.webp` | Nebula + stars — Hubble (GSFC_20171208_Archive_e000433) | https://images.nasa.gov/details/GSFC_20171208_Archive_e000433 |
| `systems/5.webp` | Nebula with jets (PIA16022) | https://images.nasa.gov/details/PIA16022 |
| `space/universe.webp` | Face-on spiral galaxy — Hubble (GSFC_20171208_Archive_e000017) | https://images.nasa.gov/details/GSFC_20171208_Archive_e000017 |
| `space/galaxy.webp` | Edge-on spiral galaxy — Hubble (GSFC_20171208_Archive_e000117) | https://images.nasa.gov/details/GSFC_20171208_Archive_e000117 |
| `space/system.webp` | Deep field — Hubble (GSFC_20171208_Archive_e000159) | https://images.nasa.gov/details/GSFC_20171208_Archive_e000159 |

Planet sources are fetched by `scripts/fetch-nasa-planets.mjs`, backdrops by
`scripts/fetch-nasa-backgrounds.mjs`, the rest by `scripts/fetch-nasa-images.mjs`.

Credit line in-game: **"NASA / JPL-Caltech"** (Apollo 17 image: **"NASA"**;
Hubble backdrops: **"NASA / ESA / Hubble"**).

## Telescope astrophotography (used with permission)

Amateur astrophotography, **© Torsten Renner**, used with permission.

| Asset | Subject |
|---|---|
| `galaxies/1.webp` | Andromeda Galaxy (M31) |
| `galaxies/2.webp` | Galaxy |
| `systems/0.webp` | Orion Nebula (M42) |
| `systems/1.webp` | Emission nebula |
| `systems/2.webp` | Emission nebula |

The home/lobby/loading screens use `public/background1.png` (Hubble
GSFC_20171208_Archive_e000117) and `public/background2.png` (Hubble
GSFC_20171208_Archive_e000017). The placeholders `planet.png`, `sun1.png` predate
this and remain only for those screens.
