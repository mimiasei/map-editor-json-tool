// ─── H3M → OE .map conversion orchestrator (Phase 1: terrain + scenery) ──────
// Composes parse-h3m.ts + atlas.ts + terrain-map.ts + object-map.ts +
// scenery-variants.ts into a fresh `MapContainer`, seeded from a real stock
// template `.map` the same way both the reference translator's `emit_map.py`
// and this repo's own `buildBlankMap` (map-write.ts) already do — read the
// template's JSON, replace terrain/objects, keep everything else.
//
// Scope (see GitHub issue #207 for the full roadmap): terrain + scenery
// decoration only. Every other H3 object (towns, heroes, monsters, mines,
// resources, portals, quests, victory/loss conditions, player starts) is
// walked correctly (so the byte cursor never desyncs) but NOT emitted this
// round — tracked in `report.deferredObjectCounts` rather than silently
// dropped. The output has `playersCount: 0` and is not yet a playable
// scenario; it IS a structurally real, inspectable map (open it in TSE's Map
// Grid to see the converted terrain/decoration directly).

import type { MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import { parseH3mFile } from './parse-h3m'
import { buildSideBySideLayerAtlas } from './atlas'
import { buildEmptyAtlasArrays, projectLayerIntoAtlas, applyStockOceanBasinGeometry, paintEnvelopePadding } from './terrain-map'
import { resolveSceneryObjectSid, TERRAIN_OBJECT_ROLES } from './object-map'
import { buildVariantFamilies, pickVariant, createSeededRng, seedFromString } from './scenery-variants'

const BLANK_BLOCK4 = '{"comment":"","aiRolesId":"","counters":[],"interruptions":[],"quests":[]}'

export interface H3ImportReport {
  atlasWidth: number
  atlasHeight: number
  sourceSize: number
  sourceLayers: number
  sourceTitle: string
  sceneryPlaced: number
  /** Resolved base sid (pre-variant-substitution) → count of instances. */
  sceneryVariantCounts: Record<string, number>
  /** H3 templateObjectId → count of instances not emitted this phase
   *  (towns/heroes/monsters/etc — real, deferred to a later phase). */
  deferredObjectCounts: Record<number, number>
  /** Scenery-role object ids whose specific (id, animation) pair had no
   *  table entry — a real gap, not expected in practice for RoE/AB/SoD maps. */
  unresolvedSceneryCounts: Record<number, number>
  /** Object instances whose own anchor position falls outside the source
   *  map envelope (H3 tolerates this for objects whose footprint extends
   *  inward from an edge-adjacent anchor) — not emitted this phase. */
  outOfEnvelopeCount: number
}

export interface H3ImportResult {
  container: MapContainer
  report: H3ImportReport
}

/** `data` must already be decompressed (see `parse-h3m.ts`'s `gunzipH3mIfNeeded`
 *  to detect a gzip-wrapped `.h3m` before calling this). `seed` defaults to a
 *  hash of the map's own title, so re-converting the same source map is
 *  reproducible. */
export function convertH3mToMap(data: Uint8Array, catalog: GameCatalog, template: MapContainer, seed?: number): H3ImportResult {
  const parsed = parseH3mFile(data)
  const { size, layers: layerCount, title } = parsed.shape

  const layerIds = Array.from({ length: layerCount }, (_, i) => i)
  const atlas = buildSideBySideLayerAtlas(size, size, layerIds)
  const out = buildEmptyAtlasArrays(atlas)
  for (let layer = 0; layer < layerCount; layer++) {
    projectLayerIntoAtlas(parsed.layers[layer], layer, atlas, out, size)
  }
  applyStockOceanBasinGeometry(out, atlas.atlasWidth, atlas.atlasHeight)
  paintEnvelopePadding(out, atlas)

  const families = buildVariantFamilies(catalog.mapObjects)
  const rng = createSeededRng(seed ?? seedFromString(title || 'h3-import'))

  const objectGroups = new Map<string, { ids: number[]; nodes: number[]; rotations: number[]; levels: number[] }>()
  let nextId = 0
  const deferredObjectCounts: Record<number, number> = {}
  const unresolvedSceneryCounts: Record<number, number> = {}
  const sceneryVariantCounts: Record<string, number> = {}

  let outOfEnvelopeCount = 0
  for (const record of parsed.records) {
    const oid = record.templateObjectId
    // H3's own header validation tolerates an object anchor up to `size+8`
    // (see h3m-object-walk.ts's parseObjectHeader) — a real, observed
    // authoring pattern for objects whose footprint extends inward from a
    // bottom-right anchor that sits past the edge. Since this phase places
    // one instance directly at the anchor (see module doc comment), such an
    // anchor has no valid atlas node — skip it rather than crash, same as
    // the reference emitter's own "skip if the anchor falls outside its own
    // layer's envelope" behavior.
    if (record.x >= size || record.y >= size) {
      outOfEnvelopeCount += 1
      continue
    }
    const layerTiles = parsed.layers[record.layer]
    const tileIndex = record.y * size + record.x
    const h3Terrain = layerTiles?.[tileIndex]?.terrain
    const resolution = h3Terrain !== undefined
      ? resolveSceneryObjectSid(oid, record.templateAnimation, h3Terrain)
      : null

    if (!resolution) {
      const isKnownSceneryFamily = oid === 199 || oid in TERRAIN_OBJECT_ROLES
      const bucket = isKnownSceneryFamily ? unresolvedSceneryCounts : deferredObjectCounts
      bucket[oid] = (bucket[oid] ?? 0) + 1
      continue
    }

    const variantSid = pickVariant(resolution.sid, families, rng)
    sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + 1

    const node = atlas.targetNode(record.layer, record.x, record.y)
    let group = objectGroups.get(variantSid)
    if (!group) {
      group = { ids: [], nodes: [], rotations: [], levels: [] }
      objectGroups.set(variantSid, group)
    }
    group.ids.push(nextId)
    group.nodes.push(node)
    group.rotations.push(0)
    group.levels.push(0)
    nextId += 1
  }

  const objects = Array.from(objectGroups.entries()).map(([sid, g]) => ({ sid, ...g }))

  const decoder = new TextDecoder('utf-8')
  const templateB1 = JSON.parse(decoder.decode(template.chunks[0])) as Record<string, unknown>
  const templateB2 = JSON.parse(decoder.decode(template.chunks[1])) as Record<string, unknown>
  const templateB3Text = template.chunks[2] ? decoder.decode(template.chunks[2]) : '{"dialogs":{"lines":[]},"quests":{"quests":[]}}'

  const b1 = {
    ...templateB1,
    sizeX: atlas.atlasWidth,
    sizeZ: atlas.atlasHeight,
    spawns: { playersCount: 0, spawns: [] as unknown[], takenHeroes: [] as string[] },
  }

  const templateViews = (templateB2.views as Array<Record<string, unknown>>) ?? []
  const views = templateViews.map((v, i) => (
    i === 0 ? { ...v, secSizeX: Math.ceil(atlas.atlasWidth / 16), secSizeZ: Math.ceil(atlas.atlasHeight / 16) } : v
  ))
  const templateArea = (templateB2.areas as Array<Record<string, unknown>>)?.[0] ?? {}
  const areas = [{
    ...templateArea,
    id: 0,
    keyObjectId: -1,
    rootNode: 0,
    nodes: Array.from({ length: atlas.atlasWidth * atlas.atlasHeight }, (_, i) => i),
    neighbors: [] as unknown[],
  }]

  const b2 = {
    ...templateB2,
    sizeX_: atlas.atlasWidth,
    sizeZ_: atlas.atlasHeight,
    tilesMap: out.tilesMap,
    waterMap: out.waterMap,
    levelsMap: out.levelsMap,
    climbsMap: out.climbsMap,
    roadsMap: out.roadsMap,
    objects,
    squads: [] as unknown[],
    markers: [] as unknown[],
    objectsFreeId: nextId,
    squadsFreeId: 0,
    markersFreeId: 0,
    views,
    areas,
  }

  const container: MapContainer = {
    hash: template.hash,
    version: template.version,
    separator: template.separator,
    chunks: [
      new TextEncoder().encode(JSON.stringify(b1)),
      new TextEncoder().encode(JSON.stringify(b2)),
      new TextEncoder().encode(templateB3Text),
      new TextEncoder().encode(BLANK_BLOCK4),
    ],
  }

  return {
    container,
    report: {
      atlasWidth: atlas.atlasWidth, atlasHeight: atlas.atlasHeight, sourceSize: size, sourceLayers: layerCount,
      sourceTitle: title, sceneryPlaced: nextId, sceneryVariantCounts, deferredObjectCounts, unresolvedSceneryCounts,
      outOfEnvelopeCount,
    },
  }
}
