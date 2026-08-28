// ─── H3M → OE .map conversion orchestrator ───────────────────────────────────
// Composes parse-h3m.ts + atlas.ts + terrain-map.ts + object-map.ts +
// scenery-variants.ts + ownership.ts into a fresh `MapContainer`, seeded from
// a real stock template `.map` the same way both the reference translator's
// `emit_map.py` and this repo's own `buildBlankMap` (map-write.ts) already
// do — read the template's JSON, replace terrain/objects/spawns, keep
// everything else.
//
// Phase 1 (issue #207): terrain + scenery decoration.
// Phase 2 (issue #207): every other object family (towns, monsters, mines,
// resources, dwellings, portals, artifacts) via `object-map.ts`'s general
// `resolveObjectSid`, plus player-seat ownership (towns only — see
// `ownership.ts`'s own doc comment for what's simplified there: no AI
// multi-faction city split, no gate-face rotation/access-clearing, so a
// town's placement isn't guaranteed pathable/gate-aligned the way the
// reference emitter's town_gate_align.py/gate_face.py guarantee).
//
// Still deferred (tracked in `report.omittedReasonCounts`, not silently
// dropped): heroes (identity folds into the city's spawn seat, matching the
// reference project's own "no stock hero-identity path" approach), quests,
// events, victory/loss conditions, neutral-strength-calibrated random-squad
// values (Phase 3), and the structural validator (Phase 5).

import type { MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import { parseH3mFile } from './parse-h3m'
import { buildSideBySideLayerAtlas } from './atlas'
import { buildEmptyAtlasArrays, projectLayerIntoAtlas, applyStockOceanBasinGeometry, paintEnvelopePadding } from './terrain-map'
import { resolveObjectSid } from './object-map'
import { buildVariantFamilies, pickVariant, createSeededRng, seedFromString } from './scenery-variants'
import { assignOwnership, type CityCandidate } from './ownership'

const BLANK_BLOCK4 = '{"comment":"","aiRolesId":"","counters":[],"interruptions":[],"quests":[]}'

export interface H3ImportReport {
  atlasWidth: number
  atlasHeight: number
  sourceSize: number
  sourceLayers: number
  sourceTitle: string
  sceneryPlaced: number
  objectsPlaced: number
  playersCount: number
  /** Resolved base sid (pre-variant-substitution) → count of instances. */
  sceneryVariantCounts: Record<string, number>
  /** Every non-emitted object, grouped by the resolver's own named reason
   *  (e.g. `boat_no_stock_objectconfig`, `unmapped_template_object_id_84`). */
  omittedReasonCounts: Record<string, number>
  /** Playable H3 players that own no town and no neutral town was left to
   *  bind them to this round — they simply have no start (a real gap). */
  unboundOrphanOwners: number[]
  /** Object instances whose own anchor position falls outside the source
   *  map envelope (H3 tolerates this for objects whose footprint extends
   *  inward from an edge-adjacent anchor) — not emitted this phase. */
  outOfEnvelopeCount: number
}

export interface H3ImportResult {
  container: MapContainer
  report: H3ImportReport
}

interface TownEntry {
  index: number
  objectId: number
  factionSid: string
  freeChoice: boolean
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
  const placeObject = (sid: string, node: number): number => {
    let group = objectGroups.get(sid)
    if (!group) { group = { ids: [], nodes: [], rotations: [], levels: [] }; objectGroups.set(sid, group) }
    const id = nextId
    group.ids.push(id)
    group.nodes.push(node)
    group.rotations.push(0)
    group.levels.push(0)
    nextId += 1
    return id
  }

  const omittedReasonCounts: Record<string, number> = {}
  const sceneryVariantCounts: Record<string, number> = {}
  const cityCandidates: CityCandidate[] = []
  const townEntries: TownEntry[] = []
  let sceneryPlaced = 0
  let objectsPlaced = 0
  let outOfEnvelopeCount = 0

  for (const record of parsed.records) {
    const oid = record.templateObjectId
    // H3's own header validation tolerates an object anchor up to `size+8`
    // (see h3m-object-walk.ts's parseObjectHeader) — a real, observed
    // authoring pattern for objects whose footprint extends inward from a
    // bottom-right anchor that sits past the edge. Since this phase places
    // one instance directly at the anchor, such an anchor has no valid
    // atlas node — skip it rather than crash, same as the reference
    // emitter's own "skip if the anchor falls outside its own layer's
    // envelope" behavior.
    if (record.x >= size || record.y >= size) {
      outOfEnvelopeCount += 1
      continue
    }
    const layerTiles = parsed.layers[record.layer]
    const tileIndex = record.y * size + record.x
    const h3Terrain = layerTiles?.[tileIndex]?.terrain ?? 0

    const resolution = resolveObjectSid(oid, record.templateAnimation, record.templateSubtype, h3Terrain)
    if (resolution.action === 'omit') {
      omittedReasonCounts[resolution.reason] = (omittedReasonCounts[resolution.reason] ?? 0) + 1
      continue
    }

    const node = atlas.targetNode(record.layer, record.x, record.y)

    if (resolution.kind === 'scenery') {
      const variantSid = pickVariant(resolution.sid, families, rng)
      sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + 1
      placeObject(variantSid, node)
      sceneryPlaced += 1
      continue
    }

    const objectId = placeObject(resolution.sid, node)
    objectsPlaced += 1

    if (resolution.kind === 'town') {
      const h3Owner = typeof record.owner === 'number' && record.owner !== 255 ? (record.owner as number) : null
      cityCandidates.push({ index: cityCandidates.length, h3Owner, sourceX: record.x, sourceY: record.y, sourceZ: record.z })
      townEntries.push({
        index: cityCandidates.length - 1, objectId,
        factionSid: resolution.factionSid ?? '', freeChoice: resolution.freeChoice ?? false,
      })
    }
  }

  const ownership = assignOwnership(parsed.header, cityCandidates)

  const propCities: Record<string, unknown>[] = []
  const propOwners: Record<string, unknown>[] = []
  const propSpawns: Record<string, unknown>[] = []
  const block1Spawns: Record<string, unknown>[] = []
  for (const town of townEntries) {
    const finalOwner = ownership.finalOwnerByCityIndex.get(town.index)
    propCities.push({
      type: 0, id: town.objectId, isDefined: !town.freeChoice, factionSid: town.factionSid,
      spawnHero: false, customCityName: '',
    })
    if (finalOwner !== undefined) {
      const spawnType = ownership.spawnTypeByFinalOwner.get(finalOwner) ?? 1
      propSpawns.push({ type: 0, id: town.objectId, owner: finalOwner, spawnType, spawnPointType: 0, isLocked: false })
      block1Spawns.push({
        owner: finalOwner, spawnType, spawnPointType: 0,
        isCityDefined: !town.freeChoice, factionSid: town.factionSid, isHeroDefined: false, heroSid: '',
        colorId: -1, isAlive: true, isLocked: false,
      })
    } else {
      propOwners.push({ type: 0, id: town.objectId })
    }
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
    spawns: { playersCount: ownership.finalOwners.length, spawns: block1Spawns, takenHeroes: [] as string[] },
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
    // Start from the template's own ~29-table objectsProperties shape (every
    // other table stays a template-provided empty array — a real, freshly
    // opened map is expected to have all of them present, not just the ones
    // this phase populates) and override only what this phase actually fills.
    objectsProperties: {
      ...((templateB2.objectsProperties as Record<string, unknown>) ?? {}),
      propCities, propOwners, propSpawns,
    },
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
      sourceTitle: title, sceneryPlaced, objectsPlaced, playersCount: ownership.finalOwners.length,
      sceneryVariantCounts, omittedReasonCounts, unboundOrphanOwners: ownership.unboundOrphanOwners,
      outOfEnvelopeCount,
    },
  }
}
