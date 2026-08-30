// ─── Keep placed-object footprints clear of the atlas envelope wall ─────────
// User-reported real bug: bringing back the elevated-Dirt "wall" around the
// atlas envelope (`terrain-map.ts`'s `paintEnvelopePadding`, re-added after
// this exact problem) re-exposed the reason it had been ripped out instead
// of fixed the first time — a multi-cell object (a city-spawner, most
// visibly) anchored near the H3 map's own edge can have part of its real OE
// footprint extend past the true source rectangle, landing on what would
// become wall tiles. That's not just cosmetic: passability.ts's own "wall"
// rule blocks any tile bordering a different, non-ramp-adjacent level, so an
// object partly sitting on the wall can become partly unreachable.
//
// The fix here is a clamp, not a wall removal: every placed object's real OE
// footprint (from the catalog, via the same `computeFootprintTiles` the Map
// Grid's own Move/blocked-tile logic already uses) is checked against its
// own layer's real rectangle within the shared atlas, and nudged inward by
// exactly the overhang if it doesn't fit — never rotated, never resized,
// so its own walkable interaction cell(s) move with the rest of the object
// and access is never broken, just relocated a tile or two inward.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { LayerAtlasLayout } from './atlas'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'

/** Returns `node` unchanged when `sid` isn't a resolvable catalog object
 *  (matches `computeFootprintTiles`'s own "no data" fallback: a single 1x1
 *  cell at the anchor, which — since `node` itself was already validated
 *  in-bounds by `atlas.targetNode()` when it was computed — can never need
 *  clamping anyway) or when the anchor doesn't fall within any known
 *  layer's own atlas rectangle (shouldn't happen for a real placement). */
export function clampFootprintToLayer(
  node: number, sid: string, atlas: LayerAtlasLayout, catalogById: Map<string, CatalogMapObject>,
): number {
  const template = catalogById.get(sid)
  if (!template) return node

  const width = atlas.atlasWidth
  const anchorX = node % width
  const anchorZ = Math.floor(node / width)

  let layerOffsetX: number | undefined
  let layerOffsetZ: number | undefined
  for (const spec of Object.values(atlas.layers)) {
    if (anchorX >= spec.offsetX && anchorX < spec.offsetX + atlas.layerWidth) {
      layerOffsetX = spec.offsetX
      layerOffsetZ = spec.offsetY
      break
    }
  }
  if (layerOffsetX === undefined || layerOffsetZ === undefined) return node

  const cells = computeFootprintTiles(template, anchorX, anchorZ)
  const minX = layerOffsetX
  const maxX = layerOffsetX + atlas.sourceWidth - 1
  const minZ = layerOffsetZ
  const maxZ = layerOffsetZ + atlas.sourceHeight - 1

  let cellMinX = Infinity, cellMaxX = -Infinity, cellMinZ = Infinity, cellMaxZ = -Infinity
  for (const cell of cells) {
    if (cell.x < cellMinX) cellMinX = cell.x
    if (cell.x > cellMaxX) cellMaxX = cell.x
    if (cell.z < cellMinZ) cellMinZ = cell.z
    if (cell.z > cellMaxZ) cellMaxZ = cell.z
  }

  let shiftX = 0
  if (cellMinX < minX) shiftX = minX - cellMinX
  else if (cellMaxX > maxX) shiftX = maxX - cellMaxX

  let shiftZ = 0
  if (cellMinZ < minZ) shiftZ = minZ - cellMinZ
  else if (cellMaxZ > maxZ) shiftZ = maxZ - cellMaxZ

  if (shiftX === 0 && shiftZ === 0) return node
  return (anchorZ + shiftZ) * width + (anchorX + shiftX)
}
