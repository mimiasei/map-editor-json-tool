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

export interface AnchoredNode { node: number; fallback: boolean }

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

  const fits = (ax: number, az: number): boolean => {
    for (const c of computeFootprintTiles(template, ax, az, 0)) {
      if (c.value < 1) continue
      if (c.x < spec.offsetX || c.x >= spec.offsetX + atlas.sourceWidth || c.z < spec.offsetY || c.z >= spec.offsetY + atlas.sourceHeight) return false
      const node = c.z * width + c.x
      if (env.rockNodes.has(node)) return false
      if (!waterOk && env.waterMap[node] !== 0) return false
    }
    return true
  }

  for (let radius = 0; radius <= MAX_SHIFT; radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue
        for (const e of entrances) {
          const ax = visit.x + dx - (e.x - PROBE)
          const az = visit.z + dz - (e.z - PROBE)
          if (fits(ax, az)) return { node: az * width + ax, fallback: false }
        }
      }
    }
  }
  return { node: clamped, fallback: true }
}
