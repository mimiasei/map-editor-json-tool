// ─── Real-data calibration: decoration density-vs-road-distance + object
// co-occurrence (issue #224, "Problem 2: Aesthetic detailing") ─────────────
// Measures two real statistics directly against the real hand-crafted OE
// corpus (plans/training-data/oe-corpus-raw.json, via extract-oe-corpus-raw.ts —
// needs its roadsMap field, added for this purpose; corpus size grows over
// time as more real maps are added — re-run this script and update
// decoration-calibration.ts's cited numbers whenever it does) and the real Core.zip
// catalog's `environments` category, classified into obstacles/clutter/
// mountains/pools exactly as `buildFuzzyObstaclePools` (fuzzy-obstacle.ts)
// already does — reused here rather than re-deriving sid classification
// rules.
//
// 1. Density-vs-road-distance: for every real decoration instance, its
//    4-connected grid distance to the nearest real road tile (reusing
//    zone-connections.ts's own computeRoadDistanceField), bucketed, and
//    normalized by the count of dry (non-water) tiles in each bucket to get
//    a real density-per-eligible-tile curve, then expressed relative to
//    each map's own overall density (so per-map scale differences cancel
//    before pooling across all real maps in the corpus).
// 2. Co-occurrence: for every (category A, category B) pair, the real
//    fraction of A-instances with a B-instance within CLUSTER_RADIUS(3)
//    tiles (zone-decoration.ts's own cluster radius), divided by the
//    baseline rate expected if B were spread at its own overall density
//    with no spatial preference (`1 - (1-p)^n`, p = B's per-tile density,
//    n = neighborhood tile count) — a multiplier >1 means real maps
//    cluster that pair more than chance, <1 means less.
//
// Run via this project's own esbuild-bundle-and-run technique:
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/calibrate-decoration-density.ts --outfile=/tmp/calibrate-decor.cjs
//   node /tmp/calibrate-decor.cjs
//
// Requires plans/training-data/oe-corpus-raw.json (with roadsMap — rerun
// scripts/extract-oe-corpus-raw.ts if missing it) and a real Core.zip at
// the repo root (for object-category classification).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildCatalog } from '@/lib/catalog/builder'
import { buildFuzzyObstaclePools } from '@/lib/map-grid/fuzzy-obstacle'
import { computeRoadDistanceField } from '@/lib/rmg/zone-connections'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'

const REPO_ROOT = process.cwd()

interface RawPlacedObject { type: 0 | 1 | 2; id: number; sid: string; x: number; z: number; owner?: number }
interface RawCorpusEntry {
  mapFile: string
  sizeX: number
  sizeZ: number
  waterMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  roadsMap: number[]
  placedObjects: RawPlacedObject[]
}

type Category = 'obstacles' | 'clutter' | 'mountains' | 'pools'
const CATEGORIES: Category[] = ['obstacles', 'clutter', 'mountains', 'pools']
const ALL_BIOMES: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]
const CLUSTER_RADIUS = 3
const MAX_ROAD_DIST = 30
const DIST_BUCKETS: [number, number][] = [[0, 2], [3, 5], [6, 10], [11, 20], [21, MAX_ROAD_DIST]]

async function loadCatalog() {
  const buf = readFileSync(join(REPO_ROOT, 'Core.zip'))
  const zip = await JSZip.loadAsync(buf)
  return buildCatalog(zip, 'Core.zip')
}

function buildSidCategoryMap(mapObjects: Parameters<typeof buildFuzzyObstaclePools>[0]): Map<string, Category> {
  const sidToCategory = new Map<string, Category>()
  const pools = buildFuzzyObstaclePools(mapObjects)
  for (const biome of ALL_BIOMES) {
    for (const sid of pools[biome].obstacles) sidToCategory.set(sid, 'obstacles')
    for (const sid of pools[biome].clutter) sidToCategory.set(sid, 'clutter')
    for (const sid of pools[biome].mountains) sidToCategory.set(sid, 'mountains')
    for (const sid of pools[biome].pools) sidToCategory.set(sid, 'pools')
  }
  return sidToCategory
}

function bucketIndexFor(dist: number): number {
  for (let i = 0; i < DIST_BUCKETS.length; i++) {
    const [lo, hi] = DIST_BUCKETS[i]
    if (dist >= lo && dist <= hi) return i
  }
  return DIST_BUCKETS.length - 1
}

async function main() {
  const catalog = await loadCatalog()
  const sidToCategory = buildSidCategoryMap(catalog.mapObjects)

  const data: (RawCorpusEntry | { mapFile: string; error: string })[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'plans/training-data/oe-corpus-raw.json'), 'utf8'),
  )

  // ── Part 1: density vs. road-distance ──────────────────────────────────
  const bucketDecorCount = new Array(DIST_BUCKETS.length).fill(0)
  const bucketTileCount = new Array(DIST_BUCKETS.length).fill(0)
  let perMapRelativeDensities: number[][] = []

  // ── Part 2: co-occurrence ───────────────────────────────────────────────
  const coOccurHits: Record<string, number> = {}
  const coOccurTotalA: Record<string, number> = {}
  const categoryTileDensity: Record<Category, number[]> = { obstacles: [], clutter: [], mountains: [], pools: [] }

  for (const entry of data) {
    if ('error' in entry) { console.log(entry.mapFile, 'SKIP (parse error)'); continue }
    const { sizeX, sizeZ, waterMap, roadsMap, placedObjects } = entry
    const tileCount = sizeX * sizeZ
    if (tileCount <= 0) continue

    const dryTiles: number[] = []
    for (let n = 0; n < tileCount; n++) if ((waterMap[n] ?? 0) === 0) dryTiles.push(n)
    if (dryTiles.length === 0) continue

    const roadNodes = new Set<number>()
    for (let n = 0; n < tileCount; n++) if ((roadsMap[n] ?? 0) !== 0) roadNodes.add(n)

    const byCategory: Record<Category, { node: number; sid: string }[]> = { obstacles: [], clutter: [], mountains: [], pools: [] }
    for (const obj of placedObjects) {
      if (obj.type !== 0) continue
      const cat = sidToCategory.get(obj.sid)
      if (!cat) continue
      byCategory[cat].push({ node: obj.z * sizeX + obj.x, sid: obj.sid })
    }
    const totalDecor = CATEGORIES.reduce((sum, c) => sum + byCategory[c].length, 0)
    if (totalDecor === 0) { console.log(entry.mapFile, 'SKIP (no classified decoration instances)'); continue }

    // Part 1: road-distance density (only meaningful if the map has roads).
    if (roadNodes.size > 0) {
      const distField = computeRoadDistanceField(roadNodes, sizeX, sizeZ, MAX_ROAD_DIST)
      const mapBucketDecor = new Array(DIST_BUCKETS.length).fill(0)
      const mapBucketTiles = new Array(DIST_BUCKETS.length).fill(0)
      for (const node of dryTiles) {
        const d = Math.min(distField[node], MAX_ROAD_DIST)
        const b = bucketIndexFor(d)
        mapBucketTiles[b]++
        bucketTileCount[b]++
      }
      for (const cat of CATEGORIES) {
        for (const { node } of byCategory[cat]) {
          const d = Math.min(distField[node], MAX_ROAD_DIST)
          const b = bucketIndexFor(d)
          mapBucketDecor[b]++
          bucketDecorCount[b]++
        }
      }
      const mapOverallDensity = totalDecor / dryTiles.length
      const relDensities = mapBucketTiles.map((tiles, i) => (tiles > 0 ? (mapBucketDecor[i] / tiles) / mapOverallDensity : NaN))
      perMapRelativeDensities.push(relDensities)
    }

    // Part 2: co-occurrence — real per-category density on this map, and
    // radius-CLUSTER_RADIUS neighbor checks.
    for (const cat of CATEGORIES) categoryTileDensity[cat].push(byCategory[cat].length / dryTiles.length)

    const nodeSetByCategory: Record<Category, Set<number>> = {
      obstacles: new Set(byCategory.obstacles.map((o) => o.node)),
      clutter: new Set(byCategory.clutter.map((o) => o.node)),
      mountains: new Set(byCategory.mountains.map((o) => o.node)),
      pools: new Set(byCategory.pools.map((o) => o.node)),
    }
    const neighborOffsets: [number, number][] = []
    for (let dz = -CLUSTER_RADIUS; dz <= CLUSTER_RADIUS; dz++) {
      for (let dx = -CLUSTER_RADIUS; dx <= CLUSTER_RADIUS; dx++) {
        if (dx === 0 && dz === 0) continue
        neighborOffsets.push([dx, dz])
      }
    }
    for (const catA of CATEGORIES) {
      for (const { node } of byCategory[catA]) {
        const x = node % sizeX
        const z = Math.floor(node / sizeX)
        for (const catB of CATEGORIES) {
          const key = `${catA}:${catB}`
          coOccurTotalA[key] = (coOccurTotalA[key] ?? 0) + 1
          let found = false
          for (const [dx, dz] of neighborOffsets) {
            const nx = x + dx, nz = z + dz
            if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
            if (nodeSetByCategory[catB].has(nz * sizeX + nx)) { found = true; break }
          }
          if (found) coOccurHits[key] = (coOccurHits[key] ?? 0) + 1
        }
      }
    }
  }

  console.log('=== Density vs. road-distance (pooled across all maps with roads) ===')
  console.log('bucket'.padEnd(12), 'decorCount', 'tileCount', 'rawDensity', 'relativeToOverall')
  const overallRawDensity = bucketDecorCount.reduce((a, b) => a + b, 0) / bucketTileCount.reduce((a, b) => a + b, 0)
  for (let i = 0; i < DIST_BUCKETS.length; i++) {
    const raw = bucketTileCount[i] > 0 ? bucketDecorCount[i] / bucketTileCount[i] : NaN
    console.log(
      `[${DIST_BUCKETS[i][0]}-${DIST_BUCKETS[i][1]}]`.padEnd(12),
      bucketDecorCount[i], bucketTileCount[i], raw.toFixed(5), (raw / overallRawDensity).toFixed(3),
    )
  }
  perMapRelativeDensities = perMapRelativeDensities.filter((row) => row.every((v) => !Number.isNaN(v)))
  console.log(`\n(maps contributing to pooled road-distance stat: ${perMapRelativeDensities.length})`)
  console.log('per-bucket median of per-map relative density (cross-check vs. pooled figure above):')
  for (let i = 0; i < DIST_BUCKETS.length; i++) {
    const vals = perMapRelativeDensities.map((row) => row[i]).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b)
    const median = vals.length > 0 ? vals[Math.floor(vals.length / 2)] : NaN
    console.log(`  [${DIST_BUCKETS[i][0]}-${DIST_BUCKETS[i][1]}]`, 'median=', median.toFixed(3), 'n=', vals.length)
  }

  console.log('\n=== Co-occurrence multipliers (observed / baseline), pooled across all real maps ===')
  console.log('A\\B'.padEnd(12), ...CATEGORIES.map((c) => c.padEnd(12)))
  // Average per-tile density per category across maps (simple mean of
  // per-map densities — each map contributes one density sample).
  const meanDensity: Record<Category, number> = {
    obstacles: mean(categoryTileDensity.obstacles), clutter: mean(categoryTileDensity.clutter),
    mountains: mean(categoryTileDensity.mountains), pools: mean(categoryTileDensity.pools),
  }
  const neighborTileCount = (2 * CLUSTER_RADIUS + 1) ** 2 - 1
  for (const catA of CATEGORIES) {
    const row: string[] = []
    for (const catB of CATEGORIES) {
      const key = `${catA}:${catB}`
      const totalA = coOccurTotalA[key] ?? 0
      const hits = coOccurHits[key] ?? 0
      if (totalA === 0) { row.push('n/a'.padEnd(12)); continue }
      const observed = hits / totalA
      const p = meanDensity[catB]
      const baseline = 1 - (1 - p) ** neighborTileCount
      const multiplier = baseline > 0 ? observed / baseline : NaN
      row.push(`${multiplier.toFixed(2)}(n${totalA})`.padEnd(12))
    }
    console.log(catA.padEnd(12), ...row)
  }
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

main()
