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
// `resolveObjectSid`, plus player-seat ownership (towns and townless-hero
// players — see `ownership.ts`'s own doc comment for what's simplified
// there: no AI multi-faction city split, no gate-face rotation/access-
// clearing, so a spawner's placement isn't guaranteed pathable/gate-aligned
// the way the reference emitter's town_gate_align.py/gate_face.py
// guarantee).
// Phase 3 (issue #207): neutral-strength-calibrated `random-squad`
// requestedValue (neutral-strength.ts) and random-item rarity binning
// (random-items.ts) — a monster with no known creature type/level is now
// omitted rather than placed uncalibrated.
// Phase 4 (issue #207): H3's WINSTANDARD ("defeat all enemies") victory
// condition, emitted as a real QuestScript `MainQuest` (victory.ts) — the
// one victory type common enough to be worth this round's effort; any
// other H3 victory type (TAKEMINES, GATHERTROOP, ...) leaves no victory
// quest at all (see `report.hasVictoryQuest`), a real gap, not a guess.
//
// Player starts (user-reported real bug, fixed this round): every H3 town
// owned by a playable player becomes OE's own real player-start object,
// `city-spawner` (never a direct `human_city`/etc. object — a direct town
// object is a normal, capturable building, not a start point, and using one
// as a "start" left the converted map non-functional). A playable player
// who owns no town but has a placed Hero (or Random Hero) instead gets a
// `hero-spawner` — a completely real, common H3 setup, not an edge case.
// Only a player with neither gets the pre-existing orphan-neutral-city
// fallback (or, failing that, no start at all — `report.unboundOrphanOwners`).
// A town's own H3 custom name carries over to `city-spawner`'s
// `customCityName`. Not attempted: resolving a *specific* OE hero identity
// for `hero-spawner` (`propHeroes.heroSid` stays `'random'`) — this project
// has no H3-hero-type -> OE-hero-sid table yet, matching the reference
// project's own "no stock hero-identity path" precedent.
//
// Still deferred (tracked in `report.omittedReasonCounts`, not silently
// dropped): map events, global timed events, and the structural validator
// (Phase 5).

import type { MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import { parseH3mFile } from './parse-h3m'
import { buildSideBySideLayerAtlas } from './atlas'
import { buildEmptyAtlasArrays, projectLayerIntoAtlas, paintEnvelopePadding, buildRiverNodesTable } from './terrain-map'
import { clampFootprintToLayer } from './object-footprint-clamp'
import { resolveObjectSid, H3_OAK_TREES_OBJECT_ID, BIOME_ROLE_REPLACEMENTS, describeH3ObjectId, h3DisplayName } from './h3-object-mapping'
import { OBJECT_HERO, OBJECT_RANDOM_HERO } from './h3m-object-registry'
import { buildVariantFamilies, pickVariant, createSeededRng, seedFromString } from './scenery-variants'
import {
  footprintCellsInBounds, pickTreeClusterPlacements, packMountainCluster,
  buildOakTreePool, mountainBigSid, randomDecorRotation,
} from './scenery-clusters'
import { assignOwnership, type CityCandidate, type HeroCandidate } from './ownership'
import { stockRandomSquadRequestedValue } from './neutral-strength'
import { rarityForRandomArtifactObjectId } from './random-items'
import { buildWinstandardQuest } from './victory'
import { VICTORY_WINSTANDARD } from './h3m-format'
import { linkPortalPairs } from './portal-links'
import { applyAccessibilityPass } from './accessibility-pass'


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
  /** Every walked H3 object, grouped by `describeH3ObjectId()`'s own name
   *  (e.g. `"Reef (id 161)"`), regardless of emit/omit outcome — a full
   *  breakdown of every H3 object type in the source map, to cross-reference
   *  against `omittedReasonCounts`/`sceneryVariantCounts` above. */
  sourceObjectCounts: Record<string, number>
  /** Playable H3 players that own no town, have no placed hero, and no
   *  neutral town was left to bind them to this round — they simply have
   *  no start (a real gap). */
  unboundOrphanOwners: number[]
  /** Playable H3 players who own no town but do have a placed Hero (or
   *  Random Hero) — given a `hero-spawner` start instead of a `city-spawner`. */
  heroOnlyPlayers: number
  /** Object instances whose own anchor position falls outside the source
   *  map envelope (H3 tolerates this for objects whose footprint extends
   *  inward from an edge-adjacent anchor) — not emitted this phase. */
  outOfEnvelopeCount: number
  /** Individual tree/mountain cluster-fill cells (not whole objects) that
   *  fell outside the source map envelope and were skipped — a multi-cell
   *  H3 footprint can extend off-map even when its anchor doesn't. */
  clusterCellsClipped: number
  /** `true` when the H3 map's own victory condition was WINSTANDARD and a
   *  real "defeat all enemies" quest was emitted; `false` for any other H3
   *  victory type (TAKEMINES, GATHERTROOP, ...) or too few players — the
   *  map has no working win condition this round (Phase 4 gap). */
  hasVictoryQuest: boolean
  /** Two-way-monolith/subterranean-gate/whirlpool instances that received a
   *  real `objectsProperties.propPortals` link (see `portal-links.ts`). */
  portalsLinked: number
  /** Portal instances placed alone, with no same-sid sibling to link to —
   *  left unlinked, likely inert in-game; a real, disclosed gap. */
  portalsUnpaired: number
  /** Post-placement reachability pass (`accessibility-pass.ts`): placed
   *  instances that must be walkable-to (pickable items/resources,
   *  interactable entrances, player starts) that this importer's own object
   *  placement had made unreachable. */
  accessibilityTargetsChecked: number
  /** Decorative (scenery-role) objects deleted because they were the only
   *  thing sealing off a pocket containing an unreachable target. */
  accessibilityDecorRemoved: number
  /** Targets relocated a short distance to the nearest free, reachable tile
   *  after decoration removal alone wasn't enough (or wasn't applicable). */
  accessibilityTargetsNudged: number
  /** Targets still unreachable after both fixes — a real, disclosed gap
   *  (e.g. sealed by real H3-matching terrain/water, not a removable
   *  decoration, and too far for the bounded nudge search). */
  accessibilityStillUnreachable: number
  /** H3 river tiles converted to OE's own `rivers[0].nodes` data (real river
   *  art, not impassable — previously these were wrongly stamped into
   *  waterMap, making them look and behave like lake/ocean water). */
  riverTilesConverted: number
  /** Full per-instance detail, grouped by (h3Id, subId, defName, outcome) —
   *  deliberately finer-grained than `sourceObjectCounts` above, since many
   *  real H3 objects share an h3Id/subId/display-name but differ by `.def`
   *  sprite (different scenery variants of "Mountain", etc.), and even the
   *  exact same h3Id/subId/defName triple can resolve to a different OE
   *  object depending on the biome it was placed on (scenery role/biome
   *  dispatch in `resolveObjectSid`) — so the outcome is part of the group
   *  key, not just an annotation on top of it. Sorted by count descending
   *  by the report consumer (`ImportH3mDialog`'s "Save report…"), not here. */
  detailRows: H3ImportDetailRow[]
}

/** One row of the detailed (file-only) import report — see
 *  `H3ImportReport.detailRows`'s own doc comment for why the group key is
 *  (h3Id, subId, defName, outcome) rather than just h3Id. */
export interface H3ImportDetailRow {
  h3Id: number
  subId: number
  /** VCMI-sourced display name (`h3DisplayName()`), no "(id N)" suffix —
   *  `h3Id` above already carries the id as its own field. */
  h3Name: string
  /** `.def` sprite/animation filename, e.g. `"AVLrfx0"` — the field that
   *  disambiguates two objects that otherwise share h3Id+subId+h3Name. */
  defName: string
  /** How many source instances fell into this exact group. */
  count: number
  /** The OE object this group resolved to, or `null` when omitted/skipped. */
  mappedSid: string | null
  /** OE catalog display name for `mappedSid`, or `null` alongside it. */
  mappedName: string | null
  /** Short human-readable outcome description — an omit/skip reason, or a
   *  kind label (`"scenery (tree)"`, `"town (player start)"`, ...). */
  note: string
}

export interface H3ImportResult {
  container: MapContainer
  report: H3ImportReport
}

// Towns (and townless-hero players) are placed AFTER ownership is resolved,
// not inline in the main record loop — which real OE object a town becomes
// (a real `city-spawner` player start, vs. a plain capturable town building)
// depends on who, if anyone, ends up owning it, and that's only known once
// every record has been walked and `assignOwnership` has run.
interface TownEntry {
  index: number
  node: number
  /** The direct stock city sid `resolveObjectSid` chose (e.g. `human_city`,
   *  or `random-city` for an unmapped H3 subtype) — used only for the
   *  neutral/unowned outcome; a player-owned town always becomes
   *  `city-spawner` instead, regardless of this value. */
  sid: string
  factionSid: string
  freeChoice: boolean
  customCityName: string
}

interface HeroEntry {
  index: number
  node: number
}

/** Human-readable label for a `detailRows` group's `note`, by `ObjectKind` —
 *  everything that isn't scenery/town/random_squad/artifact (each of which
 *  gets its own more specific note built inline where it's resolved). */
const OBJECT_KIND_LABELS: Record<string, string> = {
  town: 'Town', portal: 'Portal', resource: 'Resource', mine: 'Mine', dwelling: 'Dwelling',
  artifact: 'Artifact', random_squad: 'Neutral guard', interactable: 'Interactable', map_event: 'Map event', scenery: 'Scenery',
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
  // The elevated/unclimbable Dirt "wall" for the sector-alignment margin
  // around the real source rectangle is painted at the very end of this
  // function (`paintEnvelopePadding`), not here — every object placed via
  // `placeObject` below is clamped to fit entirely inside its own layer's
  // real rectangle first (`clampFootprintToLayer`), so by the time the wall
  // is painted, nothing can be sitting on top of it. A previous version of
  // this importer painted the wall up front and just removed it entirely
  // after a user reported it breaking real objects near the H3 map's own
  // edge (a multi-cell object's footprint extending past the true edge,
  // landing partly under the wall) — the clamp is the actual fix; the wall
  // itself was never the problem.

  const families = buildVariantFamilies(catalog.mapObjects)
  const catalogById = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  const rng = createSeededRng(seed ?? seedFromString(title || 'h3-import'))

  const objectGroups = new Map<string, { ids: number[]; nodes: number[]; rotations: number[]; levels: number[] }>()
  let nextId = 0
  const placeObject = (sid: string, node: number, rotation = 0): number => {
    const clampedNode = clampFootprintToLayer(node, sid, atlas, catalogById)
    let group = objectGroups.get(sid)
    if (!group) { group = { ids: [], nodes: [], rotations: [], levels: [] }; objectGroups.set(sid, group) }
    const id = nextId
    group.ids.push(id)
    group.nodes.push(clampedNode)
    group.rotations.push(rotation)
    group.levels.push(0)
    nextId += 1
    return id
  }

  // Populated only at the two scenery-role `placeObject(...)` call sites
  // below — every one of these sids is decorative (never carries an
  // `objectsProperties.*` row), so `accessibility-pass.ts` can safely delete
  // one to unseal a pocket without orphaning any table entry.
  const decorativeIds = new Set<number>()

  const omittedReasonCounts: Record<string, number> = {}
  // Every walked record's H3 object type, named via the mapping table's own
  // VCMI-sourced names, regardless of emit/omit outcome — lets the report
  // show "what H3 object types exist in this map, and how many," directly
  // answering the original ask ("more info about each object... the
  // better") without needing per-outcome bookkeeping of its own.
  const sourceObjectCounts: Record<string, number> = {}
  const sceneryVariantCounts: Record<string, number> = {}
  interface DetailInstance { h3Id: number; subId: number; h3Name: string; defName: string; mappedSid: string | null; note: string }
  const detailInstances: DetailInstance[] = []
  // Parallel to townEntries/heroCandidates below — a town/hero's final
  // outcome (city-spawner vs. a neutral town's own sid; hero-spawner vs.
  // "not carried over") is only known once `assignOwnership` runs, well
  // after this loop — these placeholders get mutated in place once that's
  // resolved (see the townEntries/heroEntries loops further down), rather
  // than re-deriving the same decision twice.
  const townDetailByIndex: DetailInstance[] = []
  const heroDetailByIndex: DetailInstance[] = []
  const cityCandidates: CityCandidate[] = []
  const heroCandidates: HeroCandidate[] = []
  const townEntries: TownEntry[] = []
  const heroEntries: HeroEntry[] = []
  const propRandomSquads: Record<string, unknown>[] = []
  const propRandomItems: Record<string, unknown>[] = []
  let sceneryPlaced = 0
  let objectsPlaced = 0
  let outOfEnvelopeCount = 0
  let clusterCellsClipped = 0

  for (const record of parsed.records) {
    const oid = record.templateObjectId
    const sourceKey = describeH3ObjectId(oid)
    sourceObjectCounts[sourceKey] = (sourceObjectCounts[sourceKey] ?? 0) + 1
    const subId = record.templateSubtype
    const defName = record.templateAnimation
    const h3Name = h3DisplayName(oid)
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
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: null, note: 'Outside map bounds (skipped)' })
      continue
    }
    const layerTiles = parsed.layers[record.layer]
    const tileIndex = record.y * size + record.x
    const h3Terrain = layerTiles?.[tileIndex]?.terrain ?? 0

    // A placed Hero (or Random Hero) — never resolved via resolveObjectSid
    // (it has no scenery/town/etc. sid of its own to give); captured here
    // as a candidate `hero-spawner` for whichever owner ends up with no
    // town at all. A hero belonging to an owner who DOES have a town is
    // simply not emitted — their real start is that town's city-spawner,
    // and this importer has no stock path to also carry the hero's own
    // identity/army onto it (matches the pre-existing, documented "no stock
    // hero-identity path" limitation).
    if (oid === OBJECT_HERO || oid === OBJECT_RANDOM_HERO) {
      const h3Owner = typeof record.owner === 'number' && record.owner !== 255 ? (record.owner as number) : null
      if (h3Owner === null) {
        omittedReasonCounts.hero_no_owner_omit = (omittedReasonCounts.hero_no_owner_omit ?? 0) + 1
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: null, note: 'No owner (skipped)' })
        continue
      }
      const node = atlas.targetNode(record.layer, record.x, record.y)
      const index = heroCandidates.length
      heroCandidates.push({ index, h3Owner, sourceX: record.x, sourceY: record.y, sourceZ: record.z })
      heroEntries.push({ index, node })
      const heroDetail: DetailInstance = { h3Id: oid, subId, h3Name, defName, mappedSid: null, note: 'Pending hero start resolution' }
      detailInstances.push(heroDetail)
      heroDetailByIndex.push(heroDetail)
      continue
    }

    const resolution = resolveObjectSid(oid, record.templateAnimation, record.templateSubtype, h3Terrain)
    if (resolution.action === 'omit') {
      omittedReasonCounts[resolution.reason] = (omittedReasonCounts[resolution.reason] ?? 0) + 1
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: null, note: `Omitted: ${resolution.reason}` })
      continue
    }

    const node = atlas.targetNode(record.layer, record.x, record.y)

    if (resolution.kind === 'scenery') {
      // Trees and mountains: H3's own multi-cell footprint often represents
      // a cluster (a grove of trees, a mountain range) rather than one
      // object — OE has no literal cluster sid for either, so simulate one
      // by placing several small OE objects across the H3 footprint (see
      // scenery-clusters.ts's own doc comment for why this is a genuine new
      // feature, not a reference-project port).
      if (resolution.role === 'tree' || resolution.role === 'mountain') {
        const { cells, clippedCount } = footprintCellsInBounds(record.templateBlockMask, record.x, record.y, size)
        clusterCellsClipped += clippedCount
        const placements = resolution.role === 'tree'
          ? pickTreeClusterPlacements(cells, resolution.sid, families, rng,
              oid === H3_OAK_TREES_OBJECT_ID
                ? buildOakTreePool(families, BIOME_ROLE_REPLACEMENTS.tree.grass, BIOME_ROLE_REPLACEMENTS.tree.dirt)
                : undefined)
          : packMountainCluster(cells, resolution.sid, mountainBigSid(resolution.sid), families, catalogById, rng)
        for (const p of placements) {
          const cellNode = atlas.targetNode(record.layer, p.anchor.x, p.anchor.z)
          decorativeIds.add(placeObject(p.sid, cellNode, randomDecorRotation(rng)))
        }
        sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + placements.length
        sceneryPlaced += placements.length
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: resolution.sid, note: `Scenery (${resolution.role} cluster, ${placements.length} placed)` })
        continue
      }

      // Every other scenery role (shrub/rock/pool/ruin/ground/
      // water_decoration): unchanged single-object-at-anchor placement, but
      // still randomly rotated — the "always randomize decorative rotation"
      // hard rule applies to every decorative placement, not just clusters.
      const variantSid = pickVariant(resolution.sid, families, rng)
      sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + 1
      decorativeIds.add(placeObject(variantSid, node, randomDecorRotation(rng)))
      sceneryPlaced += 1
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: resolution.sid, note: `Scenery (${resolution.role ?? 'decor'})` })
      continue
    }

    if (resolution.kind === 'random_squad') {
      // Neutral-strength calibration (issue #207 Phase 3) — an H3 monster
      // with no known creature type/level has no stock SpawnsCreator
      // budget to hand it; omit with a named reason rather than place an
      // uncalibrated guard (which Phase 2 did as a documented simplification).
      const count = typeof record.count === 'number' ? record.count : 0
      const requestedValue = stockRandomSquadRequestedValue(record.templateAnimation, oid, record.templateSubtype, count)
      if (requestedValue === null) {
        const reason = `hota_or_unmapped_creature_type_${record.templateSubtype}_no_stock_squad_value`
        omittedReasonCounts[reason] = (omittedReasonCounts[reason] ?? 0) + 1
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: null, note: `Omitted: ${reason}` })
        continue
      }
      const objectId = placeObject(resolution.sid, node)
      objectsPlaced += 1
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: resolution.sid, note: `Neutral guard squad (value ${requestedValue})` })
      // Exact shape as this repo's own RANDOM_SPAWNER_TABLE_DEFAULTS
      // (map-write.ts) — tier:0 (auto-derive from value) and
      // isAutobatle:true/fraction as a string are confirmed-real, hard-won
      // facts from this project's own history, not reference-project
      // guesses (see CLAUDE.md's random-squad "Hard-won lessons").
      propRandomSquads.push({
        type: 0, id: objectId, sids: [], requestedValue, fraction: '', tier: 0, isMainGuard: false,
        reactionType: 2, customTopUnit: '', weeklyIncrementBonus: 0, diplomacyUnitsCountBonus: 0,
        isEscape: true, isAutobatle: true, isFreeDiplomacy: false, isCampaignFreeDiplomacy: false,
        isCampaignDiplomacy: false, isIgnoreMultiply: false, obstruction: '', customStacks: 0,
      })
      continue
    }

    if (resolution.kind === 'town') {
      // Deferred — see the TownEntry doc comment above. Not placed here at
      // all: a player-owned town becomes `city-spawner` (a different sid
      // entirely), and even the neutral-town outcome needs to know it
      // WASN'T claimed before choosing to place the direct sid.
      const h3Owner = typeof record.owner === 'number' && record.owner !== 255 ? (record.owner as number) : null
      const index = cityCandidates.length
      cityCandidates.push({ index, h3Owner, sourceX: record.x, sourceY: record.y, sourceZ: record.z })
      townEntries.push({
        index, node, sid: resolution.sid,
        factionSid: resolution.factionSid ?? '', freeChoice: resolution.freeChoice ?? false,
        customCityName: typeof record.name === 'string' ? record.name : '',
      })
      const townDetail: DetailInstance = { h3Id: oid, subId, h3Name, defName, mappedSid: null, note: 'Pending town ownership resolution' }
      detailInstances.push(townDetail)
      townDetailByIndex.push(townDetail)
      continue
    }

    const objectId = placeObject(resolution.sid, node)
    objectsPlaced += 1

    if (resolution.kind === 'artifact') {
      // Real H3 random-artifact-class ids (65-69) carry genuine rarity
      // info; a specific named H3 artifact (object id 5, always lossily
      // collapsed to random-item) has none — TSE's own confirmed real
      // default for a freshly-placed random-item with no further identity
      // is rarity 0 (see RANDOM_SPAWNER_TABLE_DEFAULTS in map-write.ts).
      const rarity = rarityForRandomArtifactObjectId(oid) ?? 0
      propRandomItems.push({ type: 0, id: objectId, rarity })
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: resolution.sid, note: `Artifact (rarity ${rarity})` })
    } else {
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, mappedSid: resolution.sid, note: OBJECT_KIND_LABELS[resolution.kind] ?? resolution.kind })
    }
  }

  const ownership = assignOwnership(parsed.header, cityCandidates, heroCandidates)

  // Phase 4: only H3's WINSTANDARD ("defeat all enemies") victory condition
  // is supported this round — any other type leaves no victory quest at all
  // (see victory.ts's own doc comment for why "no quest" is the honest
  // choice for an unsupported type, rather than a guessed fallback).
  const mainQuest = parsed.header.victory.type === VICTORY_WINSTANDARD && ownership.finalOwners.length >= 2
    ? buildWinstandardQuest(title, ownership.humanFinalOwner, ownership.finalOwners)
    : null

  const propCities: Record<string, unknown>[] = []
  const propOwners: Record<string, unknown>[] = []
  const propSpawns: Record<string, unknown>[] = []
  const propGrowthUnits: Record<string, unknown>[] = []
  const propHeroes: Record<string, unknown>[] = []
  const block1Spawns: Record<string, unknown>[] = []
  let heroOnlyPlayers = 0

  for (const town of townEntries) {
    const finalOwner = ownership.finalOwnerByCityIndex.get(town.index)
    if (finalOwner !== undefined) {
      // Player-owned: the real OE player start is `city-spawner`, never the
      // direct town object — see PLAYER_START_SPAWNER_DEFAULTS in
      // map-write.ts for the exact same table/field shape TSE's own "Add"
      // flow uses for a hand-placed city-spawner, mirrored here. An
      // unmapped H3 town subtype (`town.freeChoice`) becomes an
      // unconfigured city-spawner (factionSid:'', isDefined:false) rather
      // than `random-city` — CLAUDE.md confirms city-spawner is fine
      // starting unconfigured, unlike random-city (which needs a real
      // faction to function and has no Block 1 spawn involvement at all).
      const objectId = placeObject('city-spawner', town.node)
      objectsPlaced += 1
      const spawnType = ownership.spawnTypeByFinalOwner.get(finalOwner) ?? 1
      const isDefined = !town.freeChoice
      const townDetail = townDetailByIndex[town.index]
      townDetail.mappedSid = 'city-spawner'
      townDetail.note = 'Town (player start)'
      propCities.push({
        type: 0, id: objectId, isDefined, factionSid: town.factionSid, spawnHero: true,
        buildingsConstructionSid: 'default_buildings_construction',
        buildingsBanSid: 'default_buildings_ban',
        buildingsSettingsSid: 'default_buildings_settings',
        customCityName: town.customCityName,
      })
      propSpawns.push({ type: 0, id: objectId, owner: finalOwner, spawnType, spawnPointType: 0, isLocked: false })
      propGrowthUnits.push({ type: 0, id: objectId, isConstantGrowth: true, countGrowth: 1 })
      // Mirrors the random-squad `random_squad` branch above exactly (same
      // real defaults) — every real city-spawner carries one of these rows
      // too (confirmed against Stormlight.map), even with isMainGuard:false.
      propRandomSquads.push({
        type: 0, id: objectId, sids: [], requestedValue: 0, fraction: '', tier: 0, isMainGuard: false,
        reactionType: 2, customTopUnit: '', weeklyIncrementBonus: 0, diplomacyUnitsCountBonus: 0,
        isEscape: true, isAutobatle: true, isFreeDiplomacy: false, isCampaignFreeDiplomacy: false,
        isCampaignDiplomacy: false, isIgnoreMultiply: false, obstruction: '', customStacks: 0,
      })
      block1Spawns.push({
        owner: finalOwner, spawnType, spawnPointType: 0, playerId: '',
        isCityDefined: isDefined, factionSid: town.factionSid, isHeroDefined: false, heroSid: '',
        colorId: -1, isAlive: true, isLocked: false,
      })
    } else {
      // Neutral/unowned: unchanged from before this fix — a real,
      // capturable town building, not a player start.
      const objectId = placeObject(town.sid, town.node)
      objectsPlaced += 1
      propCities.push({
        type: 0, id: objectId, isDefined: !town.freeChoice, factionSid: town.factionSid,
        spawnHero: false, customCityName: town.customCityName,
      })
      propOwners.push({ type: 0, id: objectId })
      const townDetail = townDetailByIndex[town.index]
      townDetail.mappedSid = town.sid
      townDetail.note = 'Town (neutral, unclaimed)'
    }
  }

  for (const hero of heroEntries) {
    const finalOwner = ownership.finalOwnerByHeroIndex.get(hero.index)
    if (finalOwner === undefined) {
      // This hero wasn't the one chosen to back its owner's start — most
      // often because that owner already has a town (city-spawner wins).
      heroDetailByIndex[hero.index].note = 'Not carried over (player start already covered by a town)'
      continue
    }
    const objectId = placeObject('hero-spawner', hero.node)
    objectsPlaced += 1
    heroOnlyPlayers += 1
    const heroDetail = heroDetailByIndex[hero.index]
    heroDetail.mappedSid = 'hero-spawner'
    heroDetail.note = 'Hero (player start)'
    const spawnType = ownership.spawnTypeByFinalOwner.get(finalOwner) ?? 1
    propSpawns.push({ type: 0, id: objectId, owner: finalOwner, spawnType, spawnPointType: 1, isLocked: false })
    // No stock H3-hero-type -> OE-hero-sid table yet (see this file's own
    // header comment) — 'random' is TSE's own confirmed real default for an
    // unconfigured hero-spawner (map-write.ts's PLAYER_START_SPAWNER_DEFAULTS).
    propHeroes.push({ type: 0, id: objectId, isDefined: false, heroSid: 'random' })
    block1Spawns.push({
      owner: finalOwner, spawnType, spawnPointType: 1, playerId: '',
      isCityDefined: false, factionSid: '', isHeroDefined: false, heroSid: '',
      colorId: -1, isAlive: true, isLocked: false,
    })
  }

  // Every object (scenery, towns/spawners, everything else) has been placed
  // and clamped clear of the envelope margin by this point — safe to paint
  // the wall now.
  paintEnvelopePadding(out, atlas)

  // Real portal linkage (propPortals was previously never emitted at all —
  // see portal-links.ts's own header) must exist before the accessibility
  // pass can treat underground-via-portal paths as reachable, rather than
  // flagging every underground object on every 2-layer map as stranded.
  const portalLinks = linkPortalPairs(objectGroups)
  const accessibility = applyAccessibilityPass(
    objectGroups, atlas.atlasWidth, atlas.atlasHeight, out, catalog, catalogById,
    decorativeIds, portalLinks.adjacencyByObjectId,
  )

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
    startSettings: {
      ...((templateB1.startSettings as Record<string, unknown>) ?? {}),
      DefeatAllEnemiesEnabled: mainQuest !== null,
    },
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

  // OE's own river data is a separate sparse overlay (rivers[0].nodes) from
  // tilesMap/waterMap — never a waterMap stand-in (see buildRiverNodesTable's
  // doc comment for the real bug this fixes). Every real template map's own
  // rivers[0] wrapper (sid/randomSeed) is kept verbatim; only nodes[] is ours.
  const templateRiverEntry = (templateB2.rivers as Array<Record<string, unknown>>)?.[0] ?? {}
  const rivers = [{ ...templateRiverEntry, nodes: buildRiverNodesTable(out.riverNodes, atlas.atlasWidth, atlas.atlasHeight) }]

  const b2 = {
    ...templateB2,
    sizeX_: atlas.atlasWidth,
    sizeZ_: atlas.atlasHeight,
    tilesMap: out.tilesMap,
    waterMap: out.waterMap,
    levelsMap: out.levelsMap,
    climbsMap: out.climbsMap,
    roadsMap: out.roadsMap,
    rivers,
    objects,
    squads: [] as unknown[],
    markers: [] as unknown[],
    objectsFreeId: nextId,
    squadsFreeId: 0,
    markersFreeId: 0,
    views,
    areas,
    settings: {
      ...((templateB2.settings as Record<string, unknown>) ?? {}),
      mapWinConditions: [] as unknown[],
      // Pairs with every propRandomSquads row's own isAutobatle:true —
      // auto-battle is allowed against neutral/guard stacks, not against a
      // real enemy hero's army (a real OE-format fact, not H3-specific —
      // see CLAUDE.md's random-squad notes).
      disableAutoBattleAgainstEnemyHeroes: true,
    },
    // Start from the template's own ~29-table objectsProperties shape (every
    // other table stays a template-provided empty array — a real, freshly
    // opened map is expected to have all of them present, not just the ones
    // this phase populates) and override only what this phase actually fills.
    objectsProperties: {
      ...((templateB2.objectsProperties as Record<string, unknown>) ?? {}),
      propCities, propOwners, propSpawns, propRandomSquads, propRandomItems, propGrowthUnits, propHeroes,
      propPortals: portalLinks.propPortals,
    },
  }

  const templateB4 = template.chunks[3] ? JSON.parse(decoder.decode(template.chunks[3])) as Record<string, unknown> : {}
  const b4 = {
    comment: templateB4.comment ?? '',
    aiRolesId: templateB4.aiRolesId ?? '',
    counters: [] as unknown[],
    interruptions: [] as unknown[],
    quests: mainQuest ? [mainQuest] : [],
  }

  const container: MapContainer = {
    hash: template.hash,
    version: template.version,
    separator: template.separator,
    chunks: [
      new TextEncoder().encode(JSON.stringify(b1)),
      new TextEncoder().encode(JSON.stringify(b2)),
      new TextEncoder().encode(templateB3Text),
      new TextEncoder().encode(JSON.stringify(b4)),
    ],
  }

  // Group every per-instance DetailInstance (including the town/hero ones
  // just mutated above with their now-final outcome) by the full identity
  // tuple — see H3ImportReport.detailRows's own doc comment for why outcome
  // is part of the key, not just h3Id/subId/defName.
  const detailGroups = new Map<string, H3ImportDetailRow>()
  for (const inst of detailInstances) {
    const key = `${inst.h3Id}|${inst.subId}|${inst.defName}|${inst.mappedSid ?? ''}|${inst.note}`
    let row = detailGroups.get(key)
    if (!row) {
      row = {
        h3Id: inst.h3Id, subId: inst.subId, h3Name: inst.h3Name, defName: inst.defName,
        count: 0, mappedSid: inst.mappedSid,
        mappedName: inst.mappedSid ? (catalogById.get(inst.mappedSid)?.name ?? null) : null,
        note: inst.note,
      }
      detailGroups.set(key, row)
    }
    row.count += 1
  }
  const detailRows = Array.from(detailGroups.values()).sort((a, b) => b.count - a.count)

  return {
    container,
    report: {
      atlasWidth: atlas.atlasWidth, atlasHeight: atlas.atlasHeight, sourceSize: size, sourceLayers: layerCount,
      sourceTitle: title, sceneryPlaced, objectsPlaced, playersCount: ownership.finalOwners.length,
      sceneryVariantCounts, omittedReasonCounts, sourceObjectCounts, unboundOrphanOwners: ownership.unboundOrphanOwners, heroOnlyPlayers,
      outOfEnvelopeCount, clusterCellsClipped, hasVictoryQuest: mainQuest !== null,
      portalsLinked: portalLinks.linkedCount, portalsUnpaired: portalLinks.unpairedCount,
      accessibilityTargetsChecked: accessibility.targetsChecked, accessibilityDecorRemoved: accessibility.decorRemoved,
      accessibilityTargetsNudged: accessibility.targetsNudged, accessibilityStillUnreachable: accessibility.stillUnreachable,
      riverTilesConverted: out.riverNodes.size,
      detailRows,
    },
  }
}
