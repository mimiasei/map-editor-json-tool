// ─── M3 prerequisite (issue #224): real tile-adjacency frequencies ─────────
// 4-directional biome-pair adjacency counts across the real 12-map OE
// corpus — the input table `terrain-wfc.ts`'s WFC pass needs. Prints a
// TypeScript literal to paste into src/lib/rmg/terrain-adjacency-stats.ts,
// matching this project's convention of baking calibrated constants in as
// literal tables with their evidence (see guard-value-bands.ts), not
// recomputing them at runtime.
//
// Run: npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//   scripts/derive-terrain-adjacency-stats.ts --outfile=/tmp/derive.cjs && node /tmp/derive.cjs

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapContainer, gunzipBytes } from '@/lib/map-write'
import type { RawMapBlock1, RawMapBlock2 } from '@/lib/map-parser'

const EXCLUDED = new Set(['TheQuest.map', 'Stormlight.map'])
const MAPS_DIR = join(process.cwd(), 'maps')

async function main() {
  const files = readdirSync(MAPS_DIR).filter((f) => f.endsWith('.map') && !EXCLUDED.has(f))
  // counts[a][b] = how many times biome b was observed 4-adjacent to biome a
  const counts = new Map<number, Map<number, number>>()
  const bump = (a: number, b: number) => {
    if (!counts.has(a)) counts.set(a, new Map())
    const row = counts.get(a)!
    row.set(b, (row.get(b) ?? 0) + 1)
  }

  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(join(MAPS_DIR, f)))
    const container = readMapContainer(await gunzipBytes(bytes))
    const decode = (i: number) => {
      const c = container.chunks[i]
      return c ? JSON.parse(new TextDecoder().decode(c)) : undefined
    }
    const block1 = decode(0) as RawMapBlock1 | undefined
    const block2 = decode(1) as RawMapBlock2 | undefined
    if (!block1?.sizeX || !block1?.sizeZ || !block2?.tilesMap) continue
    const { sizeX, sizeZ } = block1
    const tiles = block2.tilesMap
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const node = z * sizeX + x
        const a = tiles[node]
        if (x + 1 < sizeX) bump(a, tiles[node + 1])
        if (z + 1 < sizeZ) bump(a, tiles[node + sizeX])
      }
    }
  }

  // Symmetrize (adjacency is undirected) and normalize each row to weights.
  const biomes = [...new Set([...counts.keys(), ...[...counts.values()].flatMap((r) => [...r.keys()])])].sort((a, b) => a - b)
  const sym = new Map<number, Map<number, number>>()
  for (const a of biomes) sym.set(a, new Map())
  for (const [a, row] of counts) {
    for (const [b, n] of row) {
      sym.get(a)!.set(b, (sym.get(a)!.get(b) ?? 0) + n)
      sym.get(b)!.set(a, (sym.get(b)!.get(a) ?? 0) + n)
    }
  }

  console.log('// Derived from scripts/derive-terrain-adjacency-stats.ts against all 12 real')
  console.log('// OE maps under maps/ (excl. TheQuest/Stormlight) — see issue #224.')
  console.log('// TILE_ADJACENCY_WEIGHTS[a][b] = observed 4-directional adjacency count,')
  console.log('// biome a next to biome b, symmetrized. Missing entries = never observed')
  console.log('// adjacent in any real map (hard-excluded by the WFC pass, not just low-weight).')
  console.log('export const TILE_ADJACENCY_WEIGHTS: Record<number, Record<number, number>> = {')
  for (const a of biomes) {
    const row = sym.get(a)!
    const entries = [...row.entries()].sort((x, y) => x[0] - y[0]).map(([b, n]) => `${b}: ${n}`).join(', ')
    console.log(`  ${a}: { ${entries} },`)
  }
  console.log('}')
}

main()
