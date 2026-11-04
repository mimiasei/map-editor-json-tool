// Zones for a map somebody already painted: connected regions of one biome. The generator's placers only need a partition of the
// tiles (zone id per node, tiles per zone, one biome per zone), not a zone graph, so this is enough to run them on a user's map.

import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import type { ZoneSpec } from './zone-graph'
import type { ZoneCenter } from './zone-layout'

/** Regions smaller than this are folded into the neighbour they share the longest border with. */
const MIN_REGION_TILES = 48

export interface TerrainZones {
  zones: ZoneSpec[]
  zoneIdByNode: number[]
  tilesByZone: Map<number, number[]>
  zoneBiome: Map<number, BiomeId>
  zoneAnchorNode: Map<number, number>
  centers: ZoneCenter[]
}

export function zonesFromTerrain(input: { sizeX: number; sizeZ: number; tilesMap: number[]; startNodes: number[] }): TerrainZones {
  const { sizeX, sizeZ, tilesMap, startNodes } = input
  const tileCount = sizeX * sizeZ
  const label = new Int32Array(tileCount).fill(-1)
  const sizes: number[] = []
  const biomeOf: number[] = []
  const neighbours = (n: number): number[] => {
    const x = n % sizeX
    const z = Math.floor(n / sizeX)
    const out: number[] = []
    if (x > 0) out.push(n - 1)
    if (x < sizeX - 1) out.push(n + 1)
    if (z > 0) out.push(n - sizeX)
    if (z < sizeZ - 1) out.push(n + sizeX)
    return out
  }

  for (let start = 0; start < tileCount; start++) {
    if (label[start] !== -1) continue
    const id = sizes.length
    const biome = tilesMap[start]
    let size = 0
    label[start] = id
    const stack = [start]
    while (stack.length > 0) {
      const cur = stack.pop() as number
      size++
      for (const next of neighbours(cur)) {
        if (label[next] === -1 && tilesMap[next] === biome) { label[next] = id; stack.push(next) }
      }
    }
    sizes.push(size)
    biomeOf.push(biome)
  }

  // Fold tiny regions into the neighbour they share the most border with (biggest first, so a chain of small ones lands in a big one).
  const parent = sizes.map((_, i) => i)
  const root = (i: number): number => { while (parent[i] !== i) i = parent[i]; return i }
  const small = sizes.map((s, i) => [s, i] as const).filter(([s]) => s < MIN_REGION_TILES).sort((a, b) => b[0] - a[0])
  for (const [, id] of small) {
    const border = new Map<number, number>()
    for (let n = 0; n < tileCount; n++) {
      if (label[n] !== id) continue
      for (const next of neighbours(n)) {
        const other = root(label[next])
        if (other !== id) border.set(other, (border.get(other) ?? 0) + 1)
      }
    }
    let best = -1
    let bestCount = 0
    for (const [other, count] of border) if (count > bestCount) { best = other; bestCount = count }
    if (best !== -1) parent[id] = best
  }

  const zoneIdOfRoot = new Map<number, number>()
  const zoneIdByNode: number[] = new Array(tileCount)
  const tilesByZone = new Map<number, number[]>()
  const zoneBiome = new Map<number, BiomeId>()
  for (let n = 0; n < tileCount; n++) {
    const r = root(label[n])
    let zoneId = zoneIdOfRoot.get(r)
    if (zoneId === undefined) {
      zoneId = zoneIdOfRoot.size
      zoneIdOfRoot.set(r, zoneId)
      tilesByZone.set(zoneId, [])
      zoneBiome.set(zoneId, biomeOf[r] as BiomeId)
    }
    zoneIdByNode[n] = zoneId
    tilesByZone.get(zoneId)?.push(n)
  }

  const startZones = new Map<number, number>()
  startNodes.forEach((node, i) => { if (!startZones.has(zoneIdByNode[node])) startZones.set(zoneIdByNode[node], i + 1) })

  const zones: ZoneSpec[] = []
  const zoneAnchorNode = new Map<number, number>()
  const centers: ZoneCenter[] = []
  for (const [zoneId, tiles] of tilesByZone) {
    const playerIndex = startZones.get(zoneId)
    zones.push({ id: zoneId, kind: playerIndex !== undefined ? 'player' : 'neutral', playerIndex, size: tiles.length })
    let sx = 0
    let sz = 0
    for (const n of tiles) { sx += n % sizeX; sz += Math.floor(n / sizeX) }
    const cx = sx / tiles.length
    const cz = sz / tiles.length
    centers.push({ zoneId, x: cx, z: cz })
    let anchor = tiles[0]
    let bestD = Infinity
    for (const n of tiles) {
      const d = (n % sizeX - cx) ** 2 + (Math.floor(n / sizeX) - cz) ** 2
      if (d < bestD) { bestD = d; anchor = n }
    }
    zoneAnchorNode.set(zoneId, anchor)
  }
  return { zones, zoneIdByNode, tilesByZone, zoneBiome, zoneAnchorNode, centers }
}
