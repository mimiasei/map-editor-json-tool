// ─── M1b (issue #224): normalize the real H3 training-map corpus ───────────
// Same shape of output as extract-oe-training-corpus.ts's M1a, so the two
// can be compared directly in M1.5's transfer check. Reuses the existing,
// already-merged H3M parser (src/lib/h3-import/parse-h3m.ts) rather than
// re-deriving anything — see issue #207.
//
// Run via this project's own esbuild-bundle-and-run verification technique:
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/extract-h3-training-corpus.ts --outfile=/tmp/extract-h3.cjs
//   node /tmp/extract-h3.cjs > plans/training-data/h3-corpus.json

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as zlib from 'node:zlib'
import { parseH3mFile, gunzipH3mIfNeeded } from '@/lib/h3-import/parse-h3m'

const DIR = join(process.cwd(), 'maps/H3_Maps')

function histogram(values: number[]): Record<string, number> {
  const h: Record<string, number> = {}
  for (const v of values) h[v] = (h[v] ?? 0) + 1
  return h
}

interface CorpusEntry {
  mapFile: string
  version: number
  sizeX: number
  sizeZ: number
  layers: number
  objectCount: number
  terrainBiomeHistogram: Record<string, number>
  waterTileCount: number
  roadTileCount: number
  riverTileCount: number
}

function extractOne(fileName: string): CorpusEntry | { mapFile: string; error: string } {
  try {
    let data = new Uint8Array(readFileSync(join(DIR, fileName)))
    if (gunzipH3mIfNeeded(data)) data = new Uint8Array(zlib.gunzipSync(data))
    const parsed = parseH3mFile(data)
    const surface = parsed.layers[0]
    // H3 terrain id 8 = water (per h3m-terrain.ts's own doc comment on the
    // water/river invariant) — same convention used to derive waterTileCount.
    const WATER_TERRAIN_ID = 8
    return {
      mapFile: fileName,
      version: parsed.shape.version,
      sizeX: parsed.shape.size,
      sizeZ: parsed.shape.size,
      layers: parsed.shape.layers,
      objectCount: parsed.records.length,
      terrainBiomeHistogram: histogram(surface.map((t) => t.terrain)),
      waterTileCount: surface.filter((t) => t.terrain === WATER_TERRAIN_ID).length,
      roadTileCount: surface.filter((t) => t.road > 0).length,
      riverTileCount: surface.filter((t) => t.river > 0).length,
    }
  } catch (e) {
    return { mapFile: fileName, error: e instanceof Error ? e.message : String(e) }
  }
}

function main() {
  const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.h3m'))
  const results = files.map(extractOne)
  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
}

main()
