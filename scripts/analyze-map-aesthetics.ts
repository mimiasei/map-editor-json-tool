// ─── Real-map spatial/aesthetic placement-pattern analysis (issue #230) ────
// "Reverse-engineer the human touch" — meticulously measures how real,
// hand-crafted OE maps place decorations relative to mountains/water/
// elevation/interactables/mines/player starts, and how biomes actually
// transition into each other, so a future RMG pass can lean on real
// evidence instead of designer judgment calls (e.g. this codebase's own
// `COMPATIBLE_BIOME_CLUSTERS` in fuzzy-obstacle.ts, which is explicitly
// marked "not confirmed against anything" — this script is the confirmation
// pass that comment asks for).
//
// Reuses this project's own existing sid-classification helpers rather than
// re-deriving them: buildFuzzyObstaclePools/buildTreePools (fuzzy-
// obstacle.ts) for obstacle/clutter/mountain/pool/tree buckets, the same
// corpus-load pattern as calibrate-decoration-density.ts, and
// computeRoadDistanceField (zone-connections.ts, already fully generic —
// no road-specific logic in it) re-seeded from player-start nodes for the
// starting-zone density section instead of road tiles.
//
// Run via this project's own esbuild-bundle-and-run technique:
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/analyze-map-aesthetics.ts --outfile=/tmp/analyze.cjs
//   node /tmp/analyze.cjs
//
// Requires plans/training-data/oe-corpus-raw.json to include `tilesMap`
// (added this session — re-run scripts/extract-oe-corpus-raw.ts if missing).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import JSZip from 'jszip'
import { buildCatalog } from '@/lib/catalog/builder'
import { buildFuzzyObstaclePools, buildTreePools } from '@/lib/map-grid/fuzzy-obstacle'
import { computeRoadDistanceField } from '@/lib/rmg/zone-connections'
import type { CatalogMapObject } from '@/lib/catalog/types'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'

const REPO_ROOT = process.cwd()
const RADIUS = 3
const MINE_SIDS = ['mine_wood', 'mine_ore', 'mine_gold', 'mine_gemstones', 'mine_crystals', 'mine_mercury']
const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])
const BIOME_NAMES: Record<number, string> = { 1: 'Grass', 2: 'Sand', 3: 'Deathland', 4: 'Snow', 5: 'Autumn', 6: 'Lava', 7: 'Dirt' }

interface RawPlacedObject { type: 0 | 1 | 2; id: number; sid: string; x: number; z: number; owner?: number }
interface RawCorpusEntry {
  mapFile: string; sizeX: number; sizeZ: number
  tilesMap: number[]; waterMap: number[]; levelsMap: number[]; climbsMap: number[]; roadsMap: number[]
  placedObjects: RawPlacedObject[]
}

async function loadCatalog() {
  const buf = readFileSync(join(REPO_ROOT, 'Core.zip'))
  const zip = await JSZip.loadAsync(buf)
  return buildCatalog(zip, 'Core.zip')
}

function isTreeSid(sid: string): boolean {
  return sid.startsWith('tree_') || sid.startsWith('pinetree_')
}
function isMountainSid(sid: string): boolean {
  return sid.startsWith('mountain_')
}

function neighborhood(node: number, sizeX: number, sizeZ: number, radius: number): number[] {
  const x = node % sizeX, z = Math.floor(node / sizeX)
  const out: number[] = []
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dz === 0) continue
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      out.push(nz * sizeX + nx)
    }
  }
  return out
}

function bump<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by)
}

function topEntries(map: Map<string, number>, n: number): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}

async function main() {
  const catalog = await loadCatalog()
  const sidToObj = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))
  const pools = buildFuzzyObstaclePools(catalog.mapObjects)
  const treePools = buildTreePools(catalog.mapObjects)
  const sidCategory = new Map<string, 'obstacles' | 'clutter' | 'mountains' | 'pools'>()
  for (const biome of Object.keys(pools) as unknown as BiomeId[]) {
    for (const sid of pools[biome].obstacles) sidCategory.set(sid, 'obstacles')
    for (const sid of pools[biome].clutter) sidCategory.set(sid, 'clutter')
    for (const sid of pools[biome].mountains) sidCategory.set(sid, 'mountains')
    for (const sid of pools[biome].pools) sidCategory.set(sid, 'pools')
  }
  const treeSidSet = new Set<string>()
  for (const biome of Object.keys(treePools) as unknown as BiomeId[]) for (const sid of treePools[biome].obstacles) treeSidSet.add(sid)

  const data: (RawCorpusEntry | { mapFile: string; error: string })[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'plans/training-data/oe-corpus-raw.json'), 'utf8'),
  )

  // Aggregates across all maps.
  const biomeAdjacency = new Map<number, Map<number, number>>()
  const mountainNeighborSid = new Map<string, number>()
  let treeSamePairs = 0, treeDiffPairs = 0
  const treeCoNeighborSid = new Map<string, number>()
  const nearWaterCountBySid = new Map<string, number>()
  const totalCountBySid = new Map<string, number>()
  const levelDecorCount = new Map<number, number>(), levelTileCount = new Map<number, number>()
  const nearClimbDecor = { near: 0, far: 0 }, nearClimbTiles = { near: 0, far: 0 }
  const interactableNeighborSid = new Map<string, number>()
  const mineBiomeCount = new Map<string, Map<number, number>>()
  const mineTotalCount = new Map<string, number>()
  const biomeMismatch = new Map<string, { match: number; mismatch: number }>()
  const START_DIST_BUCKETS: [number, number][] = [[0, 5], [6, 10], [11, 20], [21, 40]]
  const startBucketDecor = START_DIST_BUCKETS.map(() => 0), startBucketTiles = START_DIST_BUCKETS.map(() => 0)
  const startBucketSid: Map<string, number>[] = START_DIST_BUCKETS.map(() => new Map())
  let mapsWithStarts = 0

  for (const entry of data) {
    if ('error' in entry) continue
    const { sizeX, sizeZ, tilesMap, waterMap, levelsMap, climbsMap, placedObjects } = entry
    const tileCount = sizeX * sizeZ
    if (tilesMap.length !== tileCount) continue

    // Biome adjacency (4-directional, undirected).
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const node = z * sizeX + x
        const a = tilesMap[node]
        const bumpAdj = (b: number) => {
          if (!biomeAdjacency.has(a)) biomeAdjacency.set(a, new Map())
          bump(biomeAdjacency.get(a)!, b)
          if (!biomeAdjacency.has(b)) biomeAdjacency.set(b, new Map())
          bump(biomeAdjacency.get(b)!, a)
        }
        if (x + 1 < sizeX) bumpAdj(tilesMap[node + 1])
        if (z + 1 < sizeZ) bumpAdj(tilesMap[node + sizeX])
      }
    }

    const nodeSid = new Map<number, string>()
    const decorNodes: { node: number; sid: string }[] = []
    const interactableNodes: number[] = []
    const mineNodes: { node: number; sid: string }[] = []
    const treeNodes: number[] = []
    const mountainNodes: number[] = []
    const startNodes = new Set<number>()

    for (const obj of placedObjects) {
      if (obj.type !== 0) continue
      const node = obj.z * sizeX + obj.x
      nodeSid.set(node, obj.sid)
      if (PLAYER_START_SIDS.has(obj.sid)) startNodes.add(node)
      const cat = sidToObj.get(obj.sid)
      if (cat?.category === 'environments') {
        decorNodes.push({ node, sid: obj.sid })
        if (isTreeSid(obj.sid)) treeNodes.push(node)
        if (isMountainSid(obj.sid)) mountainNodes.push(node)
        // Real-placement biome vs catalog-declared biome.
        if (cat.biome) {
          const declaredId = Object.entries(BIOME_NAMES).find(([, name]) => name === cat.biome || (cat.biome === 'Desert' && name === 'Sand'))?.[0]
          const declared = declaredId ? Number(declaredId) : undefined
          const actual = tilesMap[node]
          if (declared !== undefined) {
            if (!biomeMismatch.has(obj.sid)) biomeMismatch.set(obj.sid, { match: 0, mismatch: 0 })
            const rec = biomeMismatch.get(obj.sid)!
            if (declared === actual) rec.match++
            else rec.mismatch++
          }
        }
      }
      if (cat?.category === 'interactables') interactableNodes.push(node)
      if (MINE_SIDS.includes(obj.sid)) mineNodes.push({ node, sid: obj.sid })
    }

    // Mountain-adjacent decoration.
    for (const mNode of mountainNodes) {
      for (const nb of neighborhood(mNode, sizeX, sizeZ, RADIUS)) {
        const sid = nodeSid.get(nb)
        if (sid && !isMountainSid(sid)) bump(mountainNeighborSid, sid)
      }
    }

    // Tree mixing ratio.
    const treeNodeSet = new Set(treeNodes)
    for (const tNode of treeNodes) {
      const mySid = nodeSid.get(tNode)!
      for (const nb of neighborhood(tNode, sizeX, sizeZ, RADIUS)) {
        if (!treeNodeSet.has(nb)) continue
        const otherSid = nodeSid.get(nb)!
        if (otherSid === mySid) treeSamePairs++
        else { treeDiffPairs++; bump(treeCoNeighborSid, otherSid) }
      }
    }

    // Water/shore dressing: for each decor sid, fraction of its own real
    // instances within radius 2 of a water tile.
    for (const { node, sid } of decorNodes) {
      bump(totalCountBySid, sid)
      const x = node % sizeX, z = Math.floor(node / sizeX)
      let nearWater = false
      for (let dz = -2; dz <= 2 && !nearWater; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, nz = z + dz
          if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
          if (waterMap[nz * sizeX + nx] > 0) { nearWater = true; break }
        }
      }
      if (nearWater) bump(nearWaterCountBySid, sid)
    }

    // Elevation: decoration density per level tier, decoration near climb tiles.
    for (let n = 0; n < tileCount; n++) {
      if (waterMap[n] > 0) continue
      bump(levelTileCount, levelsMap[n] ?? 0)
      const isNearClimb = (() => {
        const x = n % sizeX, z = Math.floor(n / sizeX)
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz
          if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
          if ((climbsMap[nz * sizeX + nx] ?? 0) > 0) return true
        }
        return false
      })()
      if (isNearClimb) nearClimbTiles.near++; else nearClimbTiles.far++
    }
    for (const { node } of decorNodes) {
      bump(levelDecorCount, levelsMap[node] ?? 0)
      const x = node % sizeX, z = Math.floor(node / sizeX)
      let near = false
      for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
        if ((climbsMap[nz * sizeX + nx] ?? 0) > 0) { near = true; break }
      }
      if (near) nearClimbDecor.near++; else nearClimbDecor.far++
    }

    // Interactive-object (mines/dwellings/etc.) dressing.
    for (const iNode of interactableNodes) {
      for (const nb of neighborhood(iNode, sizeX, sizeZ, RADIUS)) {
        const sid = nodeSid.get(nb)
        if (sid && sidToObj.get(sid)?.category === 'environments') bump(interactableNeighborSid, sid)
      }
    }

    // Mine frequency + biome cross-reference.
    for (const { node, sid } of mineNodes) {
      bump(mineTotalCount, sid)
      if (!mineBiomeCount.has(sid)) mineBiomeCount.set(sid, new Map())
      bump(mineBiomeCount.get(sid)!, tilesMap[node])
    }

    // Starting-zone density: distance-to-nearest-player-start buckets.
    if (startNodes.size > 0) {
      mapsWithStarts++
      const dist = computeRoadDistanceField(startNodes, sizeX, sizeZ, 40)
      for (let n = 0; n < tileCount; n++) {
        if (waterMap[n] > 0) continue
        const d = dist[n]
        for (let b = 0; b < START_DIST_BUCKETS.length; b++) {
          const [lo, hi] = START_DIST_BUCKETS[b]
          if (d >= lo && d <= hi) { startBucketTiles[b]++; break }
        }
      }
      for (const { node, sid } of decorNodes.concat(interactableNodes.map((n) => ({ node: n, sid: nodeSid.get(n)! })), mineNodes) as { node: number; sid: string }[]) {
        const d = dist[node]
        for (let b = 0; b < START_DIST_BUCKETS.length; b++) {
          const [lo, hi] = START_DIST_BUCKETS[b]
          if (d >= lo && d <= hi) { startBucketDecor[b]++; bump(startBucketSid[b], sid); break }
        }
      }
    }
  }

  // ── Output ────────────────────────────────────────────────────────────
  console.log('=== 1. Biome adjacency (4-directional, symmetrized, all corpus maps) ===')
  const biomes = [...biomeAdjacency.keys()].sort((a, b) => a - b)
  console.log('from\\to'.padEnd(10), ...biomes.map((b) => (BIOME_NAMES[b] ?? String(b)).padEnd(11)))
  for (const a of biomes) {
    const row = biomeAdjacency.get(a)!
    console.log((BIOME_NAMES[a] ?? String(a)).padEnd(10), ...biomes.map((b) => String(row.get(b) ?? 0).padEnd(11)))
  }
  console.log('(0 = never observed adjacent anywhere in the corpus — a real candidate "forbidden combination")')

  console.log('\n=== 2. Mountain-adjacent decoration (radius', RADIUS, ') — top 20 sids ===')
  for (const [sid, n] of topEntries(mountainNeighborSid, 20)) console.log(' ', sid, n)

  console.log('\n=== 3. Tree mixing (radius', RADIUS, ') ===')
  const totalTreePairs = treeSamePairs + treeDiffPairs
  console.log('same-species-nearby pairs:', treeSamePairs, 'different-species-nearby pairs:', treeDiffPairs,
    'same fraction:', totalTreePairs > 0 ? (treeSamePairs / totalTreePairs).toFixed(3) : 'n/a')
  console.log('top different-species neighbors seen near a tree:')
  for (const [sid, n] of topEntries(treeCoNeighborSid, 10)) console.log(' ', sid, n)

  console.log('\n=== 4. Water/shore dressing — sid % of its own instances within radius 2 of water (n>=5) ===')
  const waterFrac: [string, number, number][] = []
  for (const [sid, total] of totalCountBySid) {
    if (total < 5) continue
    const near = nearWaterCountBySid.get(sid) ?? 0
    waterFrac.push([sid, near / total, total])
  }
  waterFrac.sort((a, b) => b[1] - a[1])
  for (const [sid, frac, total] of waterFrac.slice(0, 20)) console.log(' ', sid, frac.toFixed(3), `(n=${total})`)

  console.log('\n=== 5. Elevation — decoration density by level tier (relative to dry-tile count) ===')
  const overallLevelDensity = [...levelDecorCount.values()].reduce((a, b) => a + b, 0) / [...levelTileCount.values()].reduce((a, b) => a + b, 0)
  for (const tier of [-1, 0, 1]) {
    const d = levelDecorCount.get(tier) ?? 0, t = levelTileCount.get(tier) ?? 0
    console.log('  tier', tier, 'decor=', d, 'tiles=', t, 'density=', t > 0 ? (d / t).toFixed(5) : 'n/a',
      'relativeToOverall=', t > 0 ? ((d / t) / overallLevelDensity).toFixed(3) : 'n/a')
  }
  console.log('near-climb-tile (radius 1) decoration density vs away-from-climb:')
  console.log('  near: decor=', nearClimbDecor.near, 'tiles=', nearClimbTiles.near, 'density=', (nearClimbDecor.near / nearClimbTiles.near).toFixed(5))
  console.log('  far:  decor=', nearClimbDecor.far, 'tiles=', nearClimbTiles.far, 'density=', (nearClimbDecor.far / nearClimbTiles.far).toFixed(5))

  console.log('\n=== 6. Interactive-object (mines/dwellings/etc.) dressing — top 20 nearby sids ===')
  for (const [sid, n] of topEntries(interactableNeighborSid, 20)) console.log(' ', sid, n)

  console.log('\n=== 7. Mine distribution — real placement count + biome histogram ===')
  for (const sid of MINE_SIDS) {
    const total = mineTotalCount.get(sid) ?? 0
    const byBiome = mineBiomeCount.get(sid) ?? new Map()
    const biomeStr = [...byBiome.entries()].sort((a, b) => b[1] - a[1]).map(([b, n]) => `${BIOME_NAMES[b]}=${n}`).join(', ')
    console.log(' ', sid, 'total=', total, 'biomes:', biomeStr)
  }

  console.log('\n=== 8. Real-placement biome vs catalog-declared biome (sid mismatches, n>=5) ===')
  for (const [sid, rec] of biomeMismatch) {
    const total = rec.match + rec.mismatch
    if (total < 5) continue
    if (rec.mismatch === 0) continue
    console.log(' ', sid, 'match=', rec.match, 'mismatch=', rec.mismatch, `(${(rec.mismatch / total * 100).toFixed(1)}% off-biome)`)
  }

  console.log('\n=== 9. Starting-zone density (distance-to-nearest-player-start,', mapsWithStarts, 'maps) ===')
  const overallStartDensity = startBucketDecor.reduce((a, b) => a + b, 0) / startBucketTiles.reduce((a, b) => a + b, 0)
  for (let b = 0; b < START_DIST_BUCKETS.length; b++) {
    const [lo, hi] = START_DIST_BUCKETS[b]
    const density = startBucketTiles[b] > 0 ? startBucketDecor[b] / startBucketTiles[b] : NaN
    console.log(`  [${lo}-${hi}] decor=${startBucketDecor[b]} tiles=${startBucketTiles[b]} density=${density.toFixed(5)} relativeToOverall=${(density / overallStartDensity).toFixed(3)}`)
  }
  console.log('closest bucket (day-1 radius) top sids:')
  for (const [sid, n] of topEntries(startBucketSid[0], 15)) console.log(' ', sid, n)
}

main()
