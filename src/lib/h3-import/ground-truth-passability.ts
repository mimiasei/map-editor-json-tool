// ─── H3 ground-truth passability ──────────────────────────────────────────────
// User-reported real bug: even with the accessibility pass (accessibility-pass.ts),
// converted maps still end up with areas wrongly blocked, especially underground.
// Root cause: that pass only ever discovers a problem by checking specific
// TARGET objects (an interactable/pickup/spawner-placeholder) — a stretch of
// genuinely walkable H3 floor with no such object in it (a plain room, or a
// narrow rock-carved tunnel this importer's own decorative scatter happened to
// seal shut) is invisible to it entirely. This module builds the H3 source
// map's own real passability — independent of anything this importer chose to
// place — so the accessibility pass can also protect plain floor, not just
// declared targets.
//
// A tile is "ground-truth walkable" here when H3's own data says nothing
// blocks it: not water/rock terrain, and not covered by any real placed H3
// object's own blocked footprint. This can only ever get NARROWER than "every
// non-rock non-water tile" (a real H3 object standing there removes it) —
// never wider — so using it to require "must stay reachable" can only ever
// flag tiles the source map genuinely intended to be open, matching this
// pass's existing safety property: only this importer's OWN decorative
// objects (`decorativeIds`) are ever removed to satisfy it, never a real H3
// object or terrain feature.

import type { ParsedH3M } from './parse-h3m'
import type { LayerAtlasLayout } from './atlas'
import { blockMaskOffsets } from './h3m-object-registry'

const H3_WATER_TERRAIN_ID = 8
const H3_ROCK_TERRAIN_ID = 9

/** Every atlas node whose H3 source tile is walkable per H3's own terrain +
 *  placed-object data — independent of anything this importer places. */
export function buildGroundTruthWalkableSet(parsed: ParsedH3M, atlas: LayerAtlasLayout): Set<number> {
  const { size, layers: layerCount } = parsed.shape

  const walkableByLayer: Uint8Array[] = []
  for (let layer = 0; layer < layerCount; layer++) {
    const tiles = parsed.layers[layer]
    const walkable = new Uint8Array(size * size).fill(1)
    for (let i = 0; i < tiles.length; i++) {
      const terrain = tiles[i].terrain
      if (terrain === H3_WATER_TERRAIN_ID || terrain === H3_ROCK_TERRAIN_ID) walkable[i] = 0
    }
    walkableByLayer.push(walkable)
  }

  for (const record of parsed.records) {
    // Same out-of-envelope skip as convert-h3m-to-map.ts's own main loop —
    // an anchor with no valid atlas node has no footprint to clear either.
    if (record.x >= size || record.y >= size) continue
    const walkable = walkableByLayer[record.layer]
    if (!walkable) continue
    // Deliberately NOT footprintCellsInBounds() (scenery-clusters.ts) — its
    // anchor-cell fallback for a fully-open mask (every bit set, no solid
    // cell at all) would wrongly mark a plain walk-onto object's own anchor
    // as "occupied" here; this needs the raw blocked cells only.
    for (const { dx, dz } of blockMaskOffsets(record.templateBlockMask)) {
      const x = record.x + dx
      const y = record.y + dz
      if (x < 0 || x >= size || y < 0 || y >= size) continue
      walkable[y * size + x] = 0
    }
  }

  const result = new Set<number>()
  for (let layer = 0; layer < layerCount; layer++) {
    const walkable = walkableByLayer[layer]
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (walkable[y * size + x]) result.add(atlas.targetNode(layer, x, y))
      }
    }
  }
  return result
}
