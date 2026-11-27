// ─── Place an object so its OE entrance is on the H3 entrance tile ──────────────
// H3 anchors an object at the bottom-right cell of its 8x6 mask and marks the cell a hero steps on in the visit mask. The OE template
// is a different shape, so using the H3 anchor as the OE anchor moved the entrance (the `value === 2` cell) by a tile or two, often
// onto rock or the cliff tile beside it. Here the OE template is positioned by its entrance instead, and the result must stand on
// ground the rock skirt (terrain-map.ts applyRockSkirt) left open: no footprint cell on H3 rock, none off the layer.

import type { CatalogMapObject } from '@/lib/catalog/types'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { NON_BLOCKING_SPAWNER_SIDS } from '@/lib/map-grid/passability'
import type { LayerAtlasLayout } from './atlas'
import { clampFootprintToLayer } from './object-footprint-clamp'

export interface AnchorEnv {
  atlas: LayerAtlasLayout
  catalogById: Map<string, CatalogMapObject>
  waterMap: number[]
  levelsMap: number[]
  /** Atlas nodes whose H3 tile is rock (the skirt included). */
  rockNodes: Set<number>
}

export interface VisitCell { x: number; z: number }

/** Where the H3 visit mask puts the entrance, in atlas coordinates (undefined for an object with no visit cell, or one off the layer). */
export function visitCellOe(
  visitMask: number[], anchorX: number, anchorY: number, layer: number, atlas: LayerAtlasLayout,
): VisitCell | undefined {
  const spec = atlas.layers[layer]
  if (!spec) return undefined
  // The bottom-most, right-most set cell: a normal H3 object has exactly one.
  for (let row = 5; row >= 0; row--) {
    for (let col = 7; col >= 0; col--) {
      if (((visitMask[row] >> col) & 1) === 0) continue
      const hx = anchorX + col - 7
      const hy = anchorY + row - 5
      if (hx < 0 || hy < 0 || hx >= atlas.sourceWidth || hy >= atlas.sourceHeight) return undefined
      return { x: hx + spec.offsetX, z: atlas.sourceHeight - 1 - hy + spec.offsetY }
    }
  }
  return undefined
}

const PROBE = 1000
const MAX_SHIFT = 2

export interface AnchoredNode {
  node: number
  fallback: boolean
  /** Rock tiles under the object's solid cells that must become level 0 (see the carve tier of anchorByVisitCell). */
  carve?: number[]
}

/** The anchor node for `sid`: its entrance on `visit` (or the nearest tile within MAX_SHIFT that keeps the footprint off rock),
 *  else the H3 anchor clamped into the layer as before, with `fallback: true`. */
export function anchorByVisitCell(sid: string, h3AnchorNode: number, visit: VisitCell | undefined, env: AnchorEnv): AnchoredNode {
  const { atlas, catalogById } = env
  const template = catalogById.get(sid)
  const clamped = clampFootprintToLayer(h3AnchorNode, sid, atlas, catalogById)
  if (!template || !visit || NON_BLOCKING_SPAWNER_SIDS.has(sid)) return { node: clamped, fallback: false }
  const entrances = computeFootprintTiles(template, PROBE, PROBE, 0).filter((c) => c.value === 2)
  if (entrances.length === 0) return { node: clamped, fallback: false }

  const width = atlas.atlasWidth
  const spec = Object.values(atlas.layers).find((s) => visit.x >= s.offsetX && visit.x < s.offsetX + atlas.sourceWidth)
  if (!spec) return { node: clamped, fallback: true }
  const waterOk = env.waterMap[visit.z * width + visit.x] !== 0

  const height = atlas.atlasHeight
  type Tier = 'strict' | 'skirt' | 'carve'
  /** Whether `node` is the low side of a level step (the game blocks it), counting the tiles about to be carved as level 0. */
  const isWall = (node: number, carved: Set<number>): boolean => {
    const level = carved.has(node) ? 0 : env.levelsMap[node]
    const x = node % width, z = Math.floor(node / width)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= height || (dx === 0 && dz === 0)) continue
      const m = nz * width + nx
      if ((carved.has(m) ? 0 : env.levelsMap[m]) > level) return true
    }
    return false
  }

  // First choice stays off all H3 rock. Then the level-0 skirt around the floor, which is flat ground. Last (a 3x3 spawner in a one-tile
  // tunnel has no room otherwise): the rock under the object's own solid cells is carved down to level 0, which is allowed only while one
  // entrance cell stays on open ground. Rock elsewhere is untouched.
  const fits = (ax: number, az: number, tier: Tier): number[] | null => {
    const carve: number[] = []
    const carved = new Set<number>()
    const cells = computeFootprintTiles(template, ax, az, 0).filter((c) => c.value >= 1)
    for (const c of cells) {
      if (c.x < spec.offsetX || c.x >= spec.offsetX + atlas.sourceWidth || c.z < spec.offsetY || c.z >= spec.offsetY + atlas.sourceHeight) return null
      const node = c.z * width + c.x
      if (!waterOk && env.waterMap[node] !== 0) return null
      if (tier === 'strict' && env.rockNodes.has(node)) return null
      if (env.levelsMap[node] !== 0) {
        if (tier !== 'carve') return null
        if (c.value === 1) { if (!env.rockNodes.has(node)) return null; carve.push(node); carved.add(node) }
      }
    }
    if (tier !== 'strict' && !cells.some((c) => c.value === 2 && env.levelsMap[c.z * width + c.x] === 0 && !isWall(c.z * width + c.x, carved))) return null
    return carve
  }

  for (const tier of ['strict', 'skirt', 'carve'] as Tier[]) {
    for (let radius = 0; radius <= MAX_SHIFT; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
          for (const e of entrances) {
            const ax = visit.x + dx - (e.x - PROBE)
            const az = visit.z + dz - (e.z - PROBE)
            const carve = fits(ax, az, tier)
            if (carve) return { node: az * width + ax, fallback: false, carve }
          }
        }
      }
    }
  }
  return { node: clamped, fallback: true }
}
