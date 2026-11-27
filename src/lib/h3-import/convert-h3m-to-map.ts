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
// Phase 4 (issue #207): the H3 victory condition becomes the map's win conditions (win-conditions.ts): standard victory -> Classic, capture a
// town -> Capital Hold or City Hold, defeat a hero -> Guardian's Demise; any other H3 type falls back to Classic and is named in the report
// (`report.unsupportedVictory`).
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

import { reportH3Stage, type H3ImportProgress, type H3ImportStage } from './import-progress'
import { generateMapHash, applyWinConditionEntries, FULL_DIFFICULTIES, type MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import { parseH3mFile } from './parse-h3m'
import { buildSideBySideLayerAtlas } from './atlas'
import { buildEmptyAtlasArrays, projectLayerIntoAtlas, applyRockSkirt, paintEnvelopePadding, buildRiverNodesTable } from './terrain-map'
import { clampFootprintToLayer } from './object-footprint-clamp'
import { computeFootprintTiles } from '@/lib/map-grid/footprint'
import { NON_BLOCKING_SPAWNER_SIDS, buildBlockedTileSet } from '@/lib/map-grid/passability'
import { anchorByVisitCell, visitCellOe, type VisitCell } from './object-anchor'
import { H3_UNDERGROUND_ROCK_TERRAIN_ID } from './terrain-map'
import { createH3DecorationPicker, type H3DecorationPicker } from './h3-decoration-pools'
import { resolveObjectSid, WATER_MOUNTAIN_OBJECT_IDS, H3_TERRAIN_BIOME, H3_OAK_TREES_OBJECT_ID, BIOME_ROLE_REPLACEMENTS, describeH3ObjectId, h3DisplayName, h3ObjectCategory, h3CreatureName, h3ArtifactName, h3CreatureEquivalent, h3ArtifactEquivalent } from './h3-object-mapping'
import { OBJECT_VOLCANO, HERO_OBJECT_IDS, OBJECT_TOWN, OBJECT_RANDOM_TOWN, OBJECT_HERO, OBJECT_RANDOM_HERO, OBJECT_MONSTER, OBJECT_ARTIFACT, OBJECT_SHIPYARD, blockMaskOffsets } from './h3m-object-registry'
import type { BiomeId } from '@/lib/map-grid/terrain-colors'
import { buildWaterPortals, WATER_PORTAL_SID } from './water-portals'
import { dedupeSid, generateDisplayNameSid } from '@/lib/slugify'
import { mapNameSnakeCase, mintCustomSid } from '@/lib/zip-export'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import { buildGlobalEventQuest, type GlobalEventQuest } from './global-events'
import type { DialogFlow } from '@/types/dialog'
import { buildVariantFamilies, pickVariant, createSeededRng, seedFromString } from './scenery-variants'
import {
  footprintCellsInBounds, pickTreeClusterPlacements, packMountainCluster, pickTreeClusterVaried, packMountainClusterVaried,
  buildOakTreePool, mountainBigSid, randomDecorRotation,
} from './scenery-clusters'
import { assignOwnership, type CityCandidate, type HeroCandidate } from './ownership'
import { stockRandomSquadRequestedValue, NOMINAL_STACK_COUNT_BY_LEVEL, CREATURE_TYPE_SQUAD_VALUE } from './neutral-strength'
import { rarityForRandomArtifactObjectId } from './random-items'
import { planH3WinConditions, finishH3WinPlan, H3_WIN_OPTIONS } from './win-conditions'
import { winEntryOptions, type WinConditionId } from '@/lib/rmg/win-conditions'
import { linkH3Portals, type H3PortalPlacement } from './portal-links'
import { applyAccessibilityPass } from './accessibility-pass'
import { buildGroundTruthWalkableSet } from './ground-truth-passability'
import { findStartPockets, pickSpawnerEntrance } from './start-pockets'
import type { PlacedObject } from '@/types/map-context'


/** The H3 volcano sprite that becomes a lava mountain with smoke on top (3 wide, 2 tall in H3, 3x3 in OE). */
const VOLCANO_BIG_DEF = /^avlvol50\.def$/i
const VOLCANO_MOUNTAIN_SID = 'mountain_lava_big_4'
const VOLCANO_SMOKE_SID = 'fx_map_smoke'

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
  winConditions: WinConditionId[]
  /** An H3 victory type OE has nothing like (so Classic is used instead), by name; null when the whole condition carried over. */
  unsupportedVictory: string | null
  /** Two-way-monolith/subterranean-gate/whirlpool instances that received a
   *  real `objectsProperties.propPortals` link (see `portal-links.ts`). */
  portalsLinked: number
  /** Portal instances placed alone, with no same-sid sibling to link to —
   *  left unlinked, likely inert in-game; a real, disclosed gap. */
  portalsUnpaired: number
  /** Shipyards in the H3 map (OE has no ships), the portals that replaced them plus the ones added on island shores, and the islands joined. */
  shipyardsFound: number
  shipyardPortals: number
  shipyardIslands: number
  /** Objects whose entrance could not be put on the H3 entrance tile without standing on rock; they were placed at the H3 anchor instead. */
  anchorFallbacks: number
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
  /** Plain H3 floor tiles (not water/rock, not covered by any real H3
   *  object's own footprint — `ground-truth-passability.ts`) that this
   *  importer's own decoration turned out to seal off, with no declared
   *  target of its own inside to trigger the checks above. */
  groundTruthTilesChecked: number
  groundTruthDecorRemoved: number
  /** Ground-truth-walkable tiles still unreached after decor removal — a
   *  real, disclosed gap (see accessibility-pass.ts's own doc comment). */
  groundTruthStillBlocked: number
  /** Walled-in player starts (see start-pockets.ts) and the solid pieces added to keep their walls closed. */
  startPockets: number
  startPocketSeals: number
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
  /** This H3 id's `ObjectKind` category (`h3ObjectCategory()`), or `null`
   *  when the mapping table genuinely doesn't know one — never guessed. */
  category: string | null
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
  /** Generated display-name SID -> real text (currently just custom H3
   *  town names — see `generateTownNameSid`'s own doc comment for why this
   *  can't just be written into the map container directly). The caller
   *  must register these into the live scenario's localization store
   *  (`useScenarioStore`'s `setLocalizationBatch`) — `convertH3mToMap`
   *  itself stays a pure function with no store access, so it can keep
   *  running standalone the way this project's own verification scripts
   *  already rely on. */
  localizationTokens: Record<string, string>
  /** Map-local clones of real objects that ship in the publish zip (the subterranean gates, named "Subterranean Gate"); the caller registers them. */
  customMapObjects: CustomMapObjectDefinition[]
  /** Dialog flows built for H3 global timed events (the "day 1" map-opening
   *  message, or similar) — see `localizationTokens`' own doc comment for
   *  why this can't be written into the map container directly; the
   *  caller must also register these into the live scenario's dialog
   *  store (`useScenarioStore`'s `setDialogFlow`). */
  dialogFlows: Record<string, DialogFlow>
  /** objects[] ids of the cave rocks that close thin H3 walls; later passes must not delete them. */
  sealIds: number[]
  /** Atlas nodes of H3 rock and the border: the auto-fix must not move anything onto them. */
  forbiddenNodes: Set<number>
}

// Towns (and townless-hero players) are placed AFTER ownership is resolved,
// not inline in the main record loop — which real OE object a town becomes
// (a real `city-spawner` player start, vs. a plain capturable town building)
// depends on who, if anyone, ends up owning it, and that's only known once
// every record has been walked and `assignOwnership` has run.
interface TownEntry {
  index: number
  node: number
  visit?: VisitCell
  /** The direct stock city sid `resolveObjectSid` chose (e.g. `human_city`,
   *  or `random-city` for an unmapped H3 subtype) — used only for the
   *  neutral/unowned outcome; a player-owned town always becomes
   *  `city-spawner` instead, regardless of this value. */
  sid: string
  factionSid: string
  freeChoice: boolean
  /** A generated localization SID (or '' for an unnamed town), never the
   *  raw H3 name text directly — `propCities.customCityName` is a
   *  localization SID lookup in-game, not literal text (see
   *  `generateDisplayNameSid()`'s own doc comment); writing the name
   *  straight into this field renders as `LOC:<name>` in-game. */
  customCityName: string
}

interface HeroEntry {
  index: number
  node: number
  visit?: VisitCell
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
// Sand trees, told apart by sprite (checked on a real map, sand_trees.h3m): the table sends them to a plain Grass/Dirt/Sand pick, which has no cactus,
// palm or dune on sand.
const OBJECT_MONOLITH_ONE_WAY_ENTRANCE = 43
const OBJECT_MONOLITH_ONE_WAY_EXIT = 44
const OBJECT_SUBTERRANEAN_GATE = 103

const H3_CACTUS_DEF = /^av(lca[0-9]|cact)/i // cacti: object 116 and 138
const H3_LUSH_TREE_DEF = /^avlspl0[1-4]/i // named palms, but lush like willows
const H3_PALM_DEF = /^avlspl0[5-9]/i
const H3_PALM_DUNE_DEF = /^avlxds/i // a small sand hill with a palm on top (object 206)

export async function convertH3mToMap(
  data: Uint8Array, catalog: GameCatalog, template: MapContainer, seed?: number, onProgress?: H3ImportProgress,
  /** The name the map will have in the editor (the .h3m file name): prefixes every dialog and text id the import writes. */
  mapName?: string,
): Promise<H3ImportResult> {
  const stage = (key: H3ImportStage, pct: number) => reportH3Stage(onProgress, key, pct)
  await stage('readingMap', 0)
  const parsed = parseH3mFile(data)
  const { size, layers: layerCount, title } = parsed.shape

  const layerIds = Array.from({ length: layerCount }, (_, i) => i)
  const atlas = buildSideBySideLayerAtlas(size, size, layerIds)
  const out = buildEmptyAtlasArrays(atlas)
  for (let layer = 0; layer < layerCount; layer++) {
    projectLayerIntoAtlas(parsed.layers[layer], layer, atlas, out, size)
  }
  // Rock beside floor drops to level 0 so the floor keeps its H3 width (see applyRockSkirt); `sealNodes` are the skirt tiles that
  // would otherwise be open ground where H3 had a thin wall.
  const floorNodes = new Set<number>()
  const sealNodes: number[] = []
  for (let layer = 0; layer < layerCount; layer++) {
    const skirt = applyRockSkirt(parsed.layers[layer], layer, atlas, out, size)
    for (const node of skirt.floorNodes) floorNodes.add(node)
    sealNodes.push(...skirt.sealNodes)
  }
  const rockNodes = new Set<number>()
  for (let layer = 0; layer < layerCount; layer++) {
    const tiles = parsed.layers[layer]
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].terrain === H3_UNDERGROUND_ROCK_TERRAIN_ID) rockNodes.add(atlas.targetNode(layer, i % size, Math.floor(i / size)))
    }
  }
  let anchorFallbacks = 0
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

  await stage('terrain', 8)
  const families = buildVariantFamilies(catalog.mapObjects)
  const decorationPicker = createH3DecorationPicker(catalog)
  const catalogById = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  const sidsWithPrefix = (prefix: string) => catalog.mapObjects.filter((o) => o.id.startsWith(prefix) && (o.sizeX ?? 1) === 1 && (o.sizeZ ?? 1) === 1).map((o) => o.id)
  const palmSids = sidsWithPrefix('palms_')
  const cactusSids = sidsWithPrefix('cactus_')
  const dunePalmHillSids = sidsWithPrefix('hill_desert_small_')
  const lushTreeBiomes = [decorationPicker.biomeOf('pinetree_1', 'tree'), decorationPicker.biomeOf('tree_dirt_1', 'tree')].filter((b): b is BiomeId => b !== null)
  const pickOf = (list: string[]) => list[Math.floor(rng() * list.length)]
  // A creature sid is only actually placeable as a `propSquads.unitProps[].sid`
  // guard if it appears in at least one real squad template — real-data
  // confirmed gap: a roster-only sid with zero squad-template references
  // (e.g. "gnat") loads fine here but can never actually be added to a map
  // in-game. `creatureEquivalents` is sourced/verified against this same
  // constraint, but this is checked again at use time as a defensive
  // backstop against any future bad entry (hand-edited or otherwise) —
  // falls back to the existing calibrated-random-squad path rather than
  // silently emitting an unplaceable guard.
  const placeableCreatureSids = new Set(catalog.squadTemplates.flatMap((t) => t.unitSids))
  const rng = createSeededRng(seed ?? seedFromString(title || 'h3-import'))

  const objectGroups = new Map<string, { ids: number[]; nodes: number[]; rotations: number[]; levels: number[] }>()
  // Tiles a blocking object already stands on. Everything that blocks is placed first and the decoration after (see deferredScenery), so a
  // tree or rock never overlaps an interactable or another decoration: the tile is blocked either way, and the auto-fix has nothing to move.
  const solidClaimed = new Set<number>()
  const solidCells = (sid: string, node: number, rotation: number): number[] => {
    const template = catalogById.get(sid)
    if (!template || NON_BLOCKING_SPAWNER_SIDS.has(sid)) return []
    const cells: number[] = []
    for (const c of computeFootprintTiles(template, node % atlas.atlasWidth, Math.floor(node / atlas.atlasWidth), rotation)) {
      if (c.value === 1 && c.x >= 0 && c.z >= 0 && c.x < atlas.atlasWidth && c.z < atlas.atlasHeight) cells.push(c.z * atlas.atlasWidth + c.x)
    }
    return cells
  }
  let nextId = 0
  const h3Portals: H3PortalPlacement[] = []
  const placeObject = (sid: string, node: number, rotation = 0, visit?: VisitCell): number => {
    let clampedNode: number
    if (visit) {
      const anchored = anchorByVisitCell(sid, node, visit, { atlas, catalogById, waterMap: out.waterMap, levelsMap: out.levelsMap, rockNodes })
      if (anchored.fallback) anchorFallbacks += 1
      for (const node of anchored.carve ?? []) out.levelsMap[node] = 0
      clampedNode = anchored.node
    } else {
      clampedNode = clampFootprintToLayer(node, sid, atlas, catalogById)
    }
    for (const cell of solidCells(sid, clampedNode, rotation)) solidClaimed.add(cell)
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

  // `squads[]` — a SEPARATE id-namespace from `objects[]` (type 2, not 0),
  // for a fixed/named-creature guard with no host object of its own. A
  // creature sid (e.g. "griffin") is a roster-only `GameCatalog.creatures`
  // entry, never a placeable `mapObjects` template — it can only ever be
  // referenced from `propSquads.unitProps[].sid`. The placement's own
  // VISUAL appearance in-game, however, comes from the `squads[]` template
  // sid itself (its `baseSquad`), NOT from `unitProps` — a real bug report
  // confirmed this: always using the generic `squad_neutral_one_unit_t1_1`
  // template (this file's old behavior) rendered every fixed-creature guard
  // as that template's own pixie regardless of its real composition (e.g. a
  // 28-wasp_upg guard visibly showing pixies). Fixed by picking the one
  // real squad template whose own composition is that exact single creature
  // (`unitSids.length === 1`) — every faction has a per-tier "one unit"
  // template family for exactly this (`squad_<faction>_one_unit_t<N>_<v>`),
  // built once here keyed by creature sid. Falls back to the old generic
  // pixie template only if no matching single-creature template exists.
  const FALLBACK_SQUAD_TEMPLATE_SID = 'squad_neutral_one_unit_t1_1'
  const squadTemplateSidByCreature = new Map<string, string>()
  for (const t of catalog.squadTemplates) {
    if (t.unitSids.length === 1 && !squadTemplateSidByCreature.has(t.unitSids[0])) {
      squadTemplateSidByCreature.set(t.unitSids[0], t.id)
    }
  }
  const squadGroups = new Map<string, { ids: number[]; nodes: number[] }>()
  let nextSquadId = 0
  const placeSquad = (node: number, creatureSid: string): number => {
    const templateSid = squadTemplateSidByCreature.get(creatureSid) ?? FALLBACK_SQUAD_TEMPLATE_SID
    let group = squadGroups.get(templateSid)
    if (!group) { group = { ids: [], nodes: [] }; squadGroups.set(templateSid, group) }
    const id = nextSquadId
    group.ids.push(id)
    group.nodes.push(node)
    nextSquadId += 1
    return id
  }

  // Populated only at the two scenery-role `placeObject(...)` call sites
  // below — every one of these sids is decorative (never carries an
  // `objectsProperties.*` row), so `accessibility-pass.ts` can safely delete
  // one to unseal a pocket without orphaning any table entry.
  const decorativeIds = new Set<number>()

  // Solid 1x1 cave rock on every thin-wall skirt tile. Never decorative-removable: deleting one would open a hole the H3 map does not have.
  const sealIds = new Set<number>()
  const sealModelAt = new Map<number, string>()
  for (const node of sealNodes) {
    // Dirt mountains (the rock is Dirt), a different model from the ones beside it.
    const beside = [node - 1, node + 1, node - atlas.atlasWidth, node + atlas.atlasWidth].map((n) => sealModelAt.get(n)).filter((sid): sid is string => !!sid)
    const sid = decorationPicker.pickMountain(7, 1, rng, beside)
    sealModelAt.set(node, sid)
    sealIds.add(placeObject(sid, node, randomDecorRotation(rng)))
  }

  const deferredScenery: (() => void)[] = []
  const waterMountainField = new Map<number, Map<string, { x: number; z: number }>>()
  // Volcanoes go down before any other decoration, so the trees and mountains around one cannot take its 3x3 footprint.
  const volcanoScenery: (() => void)[] = []
  // Every H3 mountain tile of the map, per layer, with its biome: the mountains are packed once over all of them (not object by object), so
  // squares can span neighbouring H3 objects. The tiles blocked stay exactly the ones H3 blocked.
  const mountainField = new Map<number, Map<string, { cell: { x: number; z: number }; biome: BiomeId }>>()
  /** Places one decoration unless a blocking object already stands on its tiles. A big mountain that only partly collides is replaced by
   *  `smallSid` on its free tiles, so every tile H3 blocked stays blocked. Returns how many objects were placed. */
  const placeScenery = (sid: string, node: number, smallSid: string | ((avoid: string[]) => string) | null): number => {
    const rotation = randomDecorRotation(rng)
    const cells = solidCells(sid, node, rotation)
    if (cells.every((cell) => !solidClaimed.has(cell))) {
      decorativeIds.add(placeObject(sid, node, rotation))
      return 1
    }
    if (!smallSid || smallSid === sid) return 0
    let placed = 0
    // A function picks each small piece itself, avoiding the models just placed beside it; a sid picks among its siblings.
    const modelAt = new Map<number, string>()
    for (const cell of cells) {
      if (solidClaimed.has(cell)) continue
      const beside = [cell - 1, cell + 1, cell - atlas.atlasWidth, cell + atlas.atlasWidth].map((n) => modelAt.get(n)).filter((m): m is string => !!m)
      const model = typeof smallSid === 'function' ? smallSid(beside) : pickVariant(smallSid, families, rng)
      modelAt.set(cell, model)
      decorativeIds.add(placeObject(model, cell, randomDecorRotation(rng)))
      placed += 1
    }
    return placed
  }

  const omittedReasonCounts: Record<string, number> = {}
  // Every walked record's H3 object type, named via the mapping table's own
  // VCMI-sourced names, regardless of emit/omit outcome — lets the report
  // show "what H3 object types exist in this map, and how many," directly
  // answering the original ask ("more info about each object... the
  // better") without needing per-outcome bookkeeping of its own.
  const sourceObjectCounts: Record<string, number> = {}
  const sceneryVariantCounts: Record<string, number> = {}
  interface DetailInstance { h3Id: number; subId: number; h3Name: string; defName: string; category: string | null; mappedSid: string | null; note: string }
  const detailInstances: DetailInstance[] = []
  // OE has no ships: every shipyard is collected here (by its visit tile) and becomes a portal once the terrain is final (water-portals.ts).
  const shipyardNodes: number[] = []
  const shipyardDetails: DetailInstance[] = []
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
  const propSquads: Record<string, unknown>[] = []
  // Every generated display-name SID so far in this import (so two
  // custom-named H3 towns never collide), and the real text each one
  // resolves to — returned to the caller to register into the live
  // scenario's localization store (see convertH3mToMap's own return
  // shape doc comment for why this stays out of this pure function).
  const generatedNameSids: string[] = []
  const localizationTokens: Record<string, string> = {}
  const idPrefix = `${mapNameSnakeCase(mapName || title || '')}_`
  const generateTownNameSid = (name: string): string => {
    const sid = dedupeSid(idPrefix + generateDisplayNameSid(name, []), generatedNameSids)
    generatedNameSids.push(sid)
    localizationTokens[sid] = name
    return sid
  }
  let sceneryPlaced = 0
  let objectsPlaced = 0
  let outOfEnvelopeCount = 0
  let clusterCellsClipped = 0

  await stage('objects', 18)
  for (const record of parsed.records) {
    const oid = record.templateObjectId
    const sourceKey = describeH3ObjectId(oid)
    sourceObjectCounts[sourceKey] = (sourceObjectCounts[sourceKey] ?? 0) + 1
    const subId = record.templateSubtype
    const defName = record.templateAnimation
    // A specific-monster/specific-artifact placement's generic H3-object-
    // class name ("Monster"/"Artifact") is far less useful than its real
    // creature/artifact identity — prefer that when this session's sourced
    // name table actually covers the subtype, falling back to the generic
    // class name for anything not yet covered (never a guess).
    const h3Name = oid === OBJECT_MONSTER ? (h3CreatureName(subId) ?? h3DisplayName(oid))
      : oid === OBJECT_ARTIFACT ? (h3ArtifactName(subId) ?? h3DisplayName(oid))
      : h3DisplayName(oid)
    const category = h3ObjectCategory(oid)
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
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: 'Outside map bounds (skipped)' })
      continue
    }
    const layerTiles = parsed.layers[record.layer]
    const tileIndex = record.y * size + record.x
    const h3Terrain = layerTiles?.[tileIndex]?.terrain ?? 0

    if (oid === OBJECT_SHIPYARD) {
      const visitCell = visitCellOe(record.templateVisitMask, record.x, record.y, record.layer, atlas)
      shipyardNodes.push(visitCell ? visitCell.z * atlas.atlasWidth + visitCell.x : atlas.targetNode(record.layer, record.x, record.y))
      const shipyardDetail: DetailInstance = { h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: 'Pending shipyard portal' }
      detailInstances.push(shipyardDetail)
      shipyardDetails.push(shipyardDetail)
      continue
    }
    // Rocks and reefs standing on water become OE water mountains: their blocked water tiles are collected per layer and packed after the loop
    // like a land range (the table rows carry `onWater: 'mountain'`).
    if (h3Terrain === 8 && WATER_MOUNTAIN_OBJECT_IDS.has(oid)) {
      const { cells, clippedCount } = footprintCellsInBounds(record.templateBlockMask, record.x, record.y, size)
      clusterCellsClipped += clippedCount
      const field = waterMountainField.get(record.layer) ?? new Map<string, { x: number; z: number }>()
      waterMountainField.set(record.layer, field)
      const layerTilesHere = parsed.layers[record.layer]
      let onWater = 0
      for (const cell of cells) {
        if (layerTilesHere?.[cell.z * size + cell.x]?.terrain !== 8) continue
        field.set(`${cell.x},${cell.z}`, cell)
        onWater += 1
      }
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: 'mountain_water', note: `Water mountain (${onWater} water tiles, packed after the loop)` })
      continue
    }
    // Anything else standing on water (a boat, a sea monster, a sea chest...) has no counterpart: OE has no ships and nothing to reach on the sea.
    if (h3Terrain === 8) {
      omittedReasonCounts.water_object_omit = (omittedReasonCounts.water_object_omit ?? 0) + 1
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: 'water_object_omit' })
      continue
    }

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
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: 'No owner (skipped)' })
        continue
      }
      // The tile a hero stands on is its visit cell (checked on [HotA] Barren Lands: the record's own x,y is a tree tile in 4 of the 8 starts, the
      // cell one to the left is where the hero is), and that is where its start's entrance must be (the 3x3 spawner would otherwise reach into rock).
      const anchorNode = atlas.targetNode(record.layer, record.x, record.y)
      const standing = visitCellOe(record.templateVisitMask, record.x, record.y, record.layer, atlas)
      const visit = standing ?? { x: anchorNode % atlas.atlasWidth, z: Math.floor(anchorNode / atlas.atlasWidth) }
      const node = visit.z * atlas.atlasWidth + visit.x
      const index = heroCandidates.length
      heroCandidates.push({ index, h3Owner, sourceX: record.x, sourceY: record.y, sourceZ: record.z })
      heroEntries.push({ index, node, visit })
      const heroDetail: DetailInstance = { h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: 'Pending hero start resolution' }
      detailInstances.push(heroDetail)
      heroDetailByIndex.push(heroDetail)
      continue
    }

    // Palms, cacti and the lush "palms" stay what they are in every biome, each cell a random model of its kind (the variation rule); a palm dune is
    // a sand hill with a palm on one cell. Placed with the other decoration, after everything that blocks.
    const sandKind = H3_CACTUS_DEF.test(defName) && cactusSids.length > 0 ? 'cactus'
      : H3_PALM_DEF.test(defName) && palmSids.length > 0 ? 'palm'
      : H3_LUSH_TREE_DEF.test(defName) && lushTreeBiomes.length > 0 ? 'lush'
      : H3_PALM_DUNE_DEF.test(defName) && palmSids.length > 0 && dunePalmHillSids.length > 0 ? 'dune' : null
    if (sandKind !== null) {
      deferredScenery.push(() => {
        const { cells } = footprintCellsInBounds(record.templateBlockMask, record.x, record.y, size)
        const palmCell = sandKind === 'dune' ? Math.floor(rng() * cells.length) : -1
        let placed = 0
        cells.forEach((cell, i) => {
          const sid = sandKind === 'cactus' ? pickOf(cactusSids)
            : sandKind === 'palm' || i === palmCell ? pickOf(palmSids)
            : sandKind === 'dune' ? pickOf(dunePalmHillSids)
            : decorationPicker.pickTree(lushTreeBiomes[Math.floor(rng() * lushTreeBiomes.length)], rng)
          placed += placeScenery(sid, atlas.targetNode(record.layer, cell.x, cell.z), null)
        })
        sceneryVariantCounts[`sand ${sandKind}`] = (sceneryVariantCounts[`sand ${sandKind}`] ?? 0) + placed
        sceneryPlaced += placed
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: sandKind, note: `Scenery (sand ${sandKind}, ${placed} placed)` })
      })
      continue
    }

    // The big volcano (AVLvol50: 3 wide, 2 tall) becomes the 3x3 lava mountain with a smoke effect on top, since the H3 one smokes and OE has no
    // volcano object. The smaller AVLvol30 (3x1) has no counterpart chosen and stays omitted.
    if (oid === OBJECT_VOLCANO && VOLCANO_BIG_DEF.test(record.templateAnimation)) {
      volcanoScenery.push(() => {
        const { cells, clippedCount } = footprintCellsInBounds(record.templateBlockMask, record.x, record.y, size)
        clusterCellsClipped += clippedCount
        if (cells.length === 0) return
        const minX = Math.min(...cells.map((c) => c.x)), maxX = Math.max(...cells.map((c) => c.x))
        const minZ = Math.min(...cells.map((c) => c.z)), maxZ = Math.max(...cells.map((c) => c.z))
        // The mountain's centre: the middle column, and for the two rows H3 blocks the northern one, so the extra row of the 3x3 lies behind it.
        const centre = atlas.targetNode(record.layer, Math.round((minX + maxX) / 2), maxZ - minZ >= 2 ? Math.round((minZ + maxZ) / 2) : minZ)
        const placed = placeScenery(VOLCANO_MOUNTAIN_SID, centre, 'mountain_lava_small_1')
        if (placed > 0 && catalogById.has(VOLCANO_SMOKE_SID)) placeObject(VOLCANO_SMOKE_SID, centre, 0)
        sceneryVariantCounts[VOLCANO_MOUNTAIN_SID] = (sceneryVariantCounts[VOLCANO_MOUNTAIN_SID] ?? 0) + placed
        sceneryPlaced += placed
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: VOLCANO_MOUNTAIN_SID, note: 'Volcano (lava mountain with smoke)' })
      })
      continue
    }

    const resolution = resolveObjectSid(oid, record.templateAnimation, record.templateSubtype, h3Terrain)
    if (resolution.action === 'omit') {
      omittedReasonCounts[resolution.reason] = (omittedReasonCounts[resolution.reason] ?? 0) + 1
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: resolution.reason })
      continue
    }

    const node = atlas.targetNode(record.layer, record.x, record.y)
    const visit = visitCellOe(record.templateVisitMask, record.x, record.y, record.layer, atlas)

    if (resolution.kind === 'scenery') {
      // Decoration goes down after everything that blocks (see `solidClaimed`), so it is queued here and placed after the main loop.
      deferredScenery.push(() => {
        // An object that blocks no tile (its block mask is empty) is walkable decoration: it becomes random walkable ground cover of its biome
        // (grass tufts, flowers, mushrooms), mixed the same way as the trees and mountains.
        if (resolution.role !== 'water_decoration' && blockMaskOffsets(record.templateBlockMask).length === 0) {
          const walkBiome = decorationPicker.walkableBiomeOf(resolution.sid)
          if (walkBiome !== null) {
            const placed = placeScenery(decorationPicker.pickWalkable(walkBiome, rng), node, null)
            sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + placed
            sceneryPlaced += placed
            detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: resolution.sid, note: 'Scenery (walkable)' })
            return
          }
        }
        // Trees and mountains: H3's own multi-cell footprint often represents
        // a cluster (a grove of trees, a mountain range) rather than one
        // object — OE has no literal cluster sid for either, so simulate one
        // by placing several small OE objects across the H3 footprint (see
        // scenery-clusters.ts's own doc comment for why this is a genuine new
        // feature, not a reference-project port).
        if (resolution.role === 'tree' || resolution.role === 'mountain') {
          const { cells, clippedCount } = footprintCellsInBounds(record.templateBlockMask, record.x, record.y, size)
          clusterCellsClipped += clippedCount
          // Each cell takes its biome from its own H3 tile (the table's sid for that tile, then that sid's catalog biome), so a grove that
          // crosses a biome border changes at the border. Oak Trees keep their fixed Grass+Dirt mix.
          const role = resolution.role
          const anchorBiome = decorationPicker.biomeOf(resolution.sid, role)
          const layerTilesHere = parsed.layers[record.layer]
          const biomeAt = (cell: { x: number; z: number }) => {
            const terrain = layerTilesHere?.[cell.z * size + cell.x]?.terrain
            const h3Biome = terrain !== undefined && terrain !== 8 && terrain !== 9 ? H3_TERRAIN_BIOME[terrain] : undefined
            return (h3Biome ? decorationPicker.biomeOf(BIOME_ROLE_REPLACEMENTS[role][h3Biome], role) : null) ?? (anchorBiome as NonNullable<typeof anchorBiome>)
          }
          if (role === 'mountain' && anchorBiome !== null) {
            const field = mountainField.get(record.layer) ?? new Map<string, { cell: { x: number; z: number }; biome: BiomeId }>()
            mountainField.set(record.layer, field)
            for (const cell of cells) field.set(`${cell.x},${cell.z}`, { cell, biome: biomeAt(cell) })
            detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: resolution.sid, note: 'Scenery (mountain range, merged across objects)' })
            return
          }
          const placements = anchorBiome !== null && !(role === 'tree' && oid === H3_OAK_TREES_OBJECT_ID)
            ? (role === 'tree' ? pickTreeClusterVaried(cells, biomeAt, decorationPicker, rng) : packMountainClusterVaried(cells, biomeAt, decorationPicker, rng))
            : role === 'tree'
              ? pickTreeClusterPlacements(cells, resolution.sid, families, rng,
                  oid === H3_OAK_TREES_OBJECT_ID
                    ? buildOakTreePool(families, BIOME_ROLE_REPLACEMENTS.tree.grass, BIOME_ROLE_REPLACEMENTS.tree.dirt)
                    : undefined)
              : packMountainCluster(cells, resolution.sid, mountainBigSid(resolution.sid), families, catalogById, rng)
          let placed = 0
          for (const p of placements) {
            const cellNode = atlas.targetNode(record.layer, p.anchor.x, p.anchor.z)
            placed += placeScenery(p.sid, cellNode, resolution.role === 'mountain' ? resolution.sid : null)
          }
          sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + placed
          sceneryPlaced += placed
          detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: resolution.sid, note: `Scenery (${resolution.role} cluster, ${placed} placed)` })
          return
        }

        // Every other scenery role (shrub/rock/pool/ruin/ground/
        // water_decoration): unchanged single-object-at-anchor placement, but
        // still randomly rotated — the "always randomize decorative rotation"
        // hard rule applies to every decorative placement, not just clusters.
        // H3 has small and large pools: eight or more blocked tiles make a large one, whatever size the table's row names.
        let baseSid = resolution.sid
        if (resolution.role === 'pool' || resolution.role === 'pool_big') {
          const poolBiome = H3_TERRAIN_BIOME[h3Terrain] ?? 'grass'
          baseSid = BIOME_ROLE_REPLACEMENTS[blockMaskOffsets(record.templateBlockMask).length >= 8 ? 'pool_big' : 'pool'][poolBiome]
        }
        const variantSid = pickVariant(baseSid, families, rng)
        const placed = placeScenery(variantSid, node, null)
        sceneryVariantCounts[resolution.sid] = (sceneryVariantCounts[resolution.sid] ?? 0) + placed
        sceneryPlaced += placed
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: resolution.sid, note: `Scenery (${resolution.role ?? 'decor'})` })
      })
      continue
    }

    if (resolution.kind === 'random_squad') {
      // A specific-monster placement (object id 54) with a real nearest-OE
      // equivalent (creatureEquivalents, this session's own sourced/matched
      // table) is placed as that ACTUAL creature — a `squads[]` (type 2)
      // entry carrying a `propSquads` row, the real "fixed/named-creature
      // guard" mechanism confirmed against `plans/olden_era_map_format.md`
      // §3.3 and real shipped-map data this session (NOT a `random-squad`
      // object with the creature's sid — a creature sid is roster-only,
      // never a placeable object template). Falls through to the existing
      // calibrated-random-squad path for the generic "Random Monster Level
      // N" placeholders (which have no real creature type at all) and any
      // id-54 subtype with no sourced equivalent.
      const equivSidCandidate = oid === OBJECT_MONSTER ? h3CreatureEquivalent(record.templateSubtype) : null
      const equivSid = equivSidCandidate && placeableCreatureSids.has(equivSidCandidate) ? equivSidCandidate : null
      if (equivSid) {
        // A real, common H3 authoring pattern, not an edge case: confirmed
        // against real shipped maps this session that the vast majority of
        // specific-monster placements leave `count` unset (0) — H3 itself
        // treats 0 as "use a nominal amount for this creature's tier," the
        // exact same sentinel the pre-existing random-squad calibration
        // above already handles via this same NOMINAL_STACK_COUNT_BY_LEVEL
        // table. Defaulting to a flat 1 here (the original version of this
        // code) turned ~96% of one real map's monster guards into
        // single-unit stacks — a real gameplay-balance regression, not
        // cosmetic.
        const nominalTier = CREATURE_TYPE_SQUAD_VALUE[record.templateSubtype]?.tier
        const nominalCount = nominalTier !== undefined ? NOMINAL_STACK_COUNT_BY_LEVEL[nominalTier] : undefined
        const unitCount = typeof record.count === 'number' && record.count > 0 ? record.count : (nominalCount ?? 1)
        const squadId = placeSquad(node, equivSid)
        propSquads.push({
          type: 2, id: squadId, isMainGuard: true, isStartBattleImmediately: false,
          reactionType: 2, weeklyIncrementBonus: 0, unitProps: [{ sid: equivSid, count: unitCount }],
        })
        // Category override: the mapping table's own `kind` for id 54 is
        // "random_squad" (matching resolveObjectSid's generic classification
        // for the whole object id), but a specific-unit placement like this
        // one is never actually random — "squad" is the real, distinct
        // category so the CSV can tell the two outcomes apart.
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category: 'squad', mappedSid: equivSid, note: `Specific unit guard (${unitCount}x)` })
        continue
      }

      // Neutral-strength calibration (issue #207 Phase 3) — an H3 monster
      // with no known creature type/level has no stock SpawnsCreator
      // budget to hand it; omit with a named reason rather than place an
      // uncalibrated guard (which Phase 2 did as a documented simplification).
      const count = typeof record.count === 'number' ? record.count : 0
      const requestedValue = stockRandomSquadRequestedValue(record.templateAnimation, oid, record.templateSubtype, count)
      if (requestedValue === null) {
        const reason = `hota_or_unmapped_creature_type_${record.templateSubtype}_no_stock_squad_value`
        omittedReasonCounts[reason] = (omittedReasonCounts[reason] ?? 0) + 1
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: reason })
        continue
      }
      const objectId = placeObject(resolution.sid, node)
      objectsPlaced += 1
      detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: resolution.sid, note: `Neutral guard squad (value ${requestedValue})` })
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
        index, node, visit, sid: resolution.sid,
        factionSid: resolution.factionSid ?? '', freeChoice: resolution.freeChoice ?? false,
        customCityName: typeof record.name === 'string' && record.name.trim() ? generateTownNameSid(record.name.trim()) : '',
      })
      const townDetail: DetailInstance = { h3Id: oid, subId, h3Name, defName, category, mappedSid: null, note: 'Pending town ownership resolution' }
      detailInstances.push(townDetail)
      townDetailByIndex.push(townDetail)
      continue
    }

    if (resolution.kind === 'artifact') {
      // A specific named H3 artifact (object id 5) with a real nearest-OE
      // equivalent (artifactEquivalents, this session's own sourced/matched
      // table) is placed as that real OE artifact object directly — a
      // genuine catalog map-object template in its own right (confirmed:
      // Core/DB/map/objects/6_artifacts.json), unlike a creature sid, so no
      // extra objectsProperties row is needed, same as any other plain
      // object. Falls back to the pre-existing random-item/rarity path
      // (real H3 random-artifact-class ids 65-69, or no equivalent found).
      const equivSid = oid === OBJECT_ARTIFACT ? h3ArtifactEquivalent(subId) : null
      if (equivSid) {
        placeObject(equivSid, node, 0, visit)
        objectsPlaced += 1
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: equivSid, note: 'Specific artifact' })
      } else {
        const objectId = placeObject(resolution.sid, node, 0, visit)
        objectsPlaced += 1
        // Real H3 random-artifact-class ids (65-69) carry genuine rarity
        // info; a specific named H3 artifact with no sourced equivalent
        // has none — TSE's own confirmed real default for a freshly-placed
        // random-item with no further identity is rarity 0 (see
        // RANDOM_SPAWNER_TABLE_DEFAULTS in map-write.ts).
        const rarity = rarityForRandomArtifactObjectId(oid) ?? 0
        propRandomItems.push({ type: 0, id: objectId, rarity })
        detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: resolution.sid, note: `Artifact (rarity ${rarity})` })
      }
      continue
    }

    // One-way monoliths: the table's sid is a placeholder; the colour (subtype) picks one of the three portal looks, the same for a colour's entrance and exit.
    const placedSid = oid === OBJECT_MONOLITH_ONE_WAY_ENTRANCE || oid === OBJECT_MONOLITH_ONE_WAY_EXIT ? `portal_${1 + (subId % 3)}` : resolution.sid
    const placedId = placeObject(placedSid, node, 0, visit)
    objectsPlaced += 1
    if (resolution.kind === 'portal') {
      // H3 connects monoliths by colour (the subtype), not by look: several colours share one OE look, so the network is kept here.
      h3Portals.push({
        id: placedId, layer: record.layer, x: record.x, y: record.y,
        kind: oid === OBJECT_MONOLITH_ONE_WAY_ENTRANCE ? 'entrance' : oid === OBJECT_MONOLITH_ONE_WAY_EXIT ? 'exit' : oid === OBJECT_SUBTERRANEAN_GATE ? 'gate' : 'two-way',
        network: oid === OBJECT_SUBTERRANEAN_GATE ? 0 : subId, look: defName.toLowerCase(),
      })
    }
    detailInstances.push({ h3Id: oid, subId, h3Name, defName, category, mappedSid: placedSid, note: OBJECT_KIND_LABELS[resolution.kind] ?? resolution.kind })
  }

  await stage('players', 30)
  const ownership = assignOwnership(parsed.header, cityCandidates, heroCandidates)

  // H3's "Specify Timed Events" — the mechanism behind the message many
  // maps open with on day 1 (see global-events.ts's own doc comment for
  // the full conversion — one quest+dialog per event, first occurrence
  // only). Fully parsed already; previously collected then dropped.
  const globalEventQuests: GlobalEventQuest[] = []
  const dialogFlows: Record<string, DialogFlow> = {}
  for (const event of parsed.globalTimedEvents) {
    const conversion = buildGlobalEventQuest(event, generatedNameSids, idPrefix)
    if (!conversion) continue
    globalEventQuests.push(conversion.quest)
    dialogFlows[conversion.dialogFlow.id] = conversion.dialogFlow
    Object.assign(localizationTokens, conversion.localizationTokens)
    generatedNameSids.push(...Object.keys(conversion.localizationTokens))
  }

  const neutralTownIds = new Map<number, number>()
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
      const objectId = placeObject('city-spawner', town.node, 0, town.visit)
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
      // spawnHero:true above needs a REAL, catalog-backed hero the moment
      // the city is actually isDefined:true — a real player.log test on a
      // hand-built map confirmed BOTH that an undefined city (isDefined:
      // false) with spawnHero:true and NO propHeroes row at all loads fine
      // (GME's own real reference), and that an isDefined:true city with
      // spawnHero:true backed only by the {isDefined:false, heroSid:
      // 'random'} placeholder still crashes identically to having no row at
      // all (ArgumentOutOfRangeException in dbi.vve, "squad config not
      // found ... tier: -1") — the placeholder only works pre-activation.
      // Mirrors generate-random-map.ts's own player-city fix exactly.
      let heroId: string | undefined
      if (isDefined) {
        const factionHeroes = catalog.heroes.filter((h) => h.fraction === town.factionSid && /^(human|necro|demon|dungeon|unfrozen|nature)_hero_\d+$/.test(h.id))
        if (factionHeroes.length > 0) heroId = factionHeroes[Math.floor(rng() * factionHeroes.length)].id
      }
      if (heroId) propHeroes.push({ type: 0, id: objectId, isDefined: true, heroSid: heroId })
      block1Spawns.push({
        owner: finalOwner, spawnType, spawnPointType: 0, playerId: '',
        isCityDefined: isDefined, factionSid: town.factionSid,
        isHeroDefined: !!heroId, heroSid: heroId ?? '',
        colorId: -1, isAlive: true, isLocked: false,
      })
    } else {
      // Neutral/unowned: unchanged from before this fix — a real,
      // capturable town building, not a player start.
      const objectId = placeObject(town.sid, town.node, 0, town.visit)
      objectsPlaced += 1
      propCities.push({
        type: 0, id: objectId, isDefined: !town.freeChoice, factionSid: town.factionSid,
        spawnHero: false, customCityName: town.customCityName,
      })
      propOwners.push({ type: 0, id: objectId })
      neutralTownIds.set(town.index, objectId)
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
    const objectId = placeObject('hero-spawner', hero.node, 0, hero.visit)
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

  // Shipyards become portals, and the islands get portals to each other (the stand-in for ships), before the decoration so nothing grows on them.
  const entranceCells = new Set<number>()
  const entranceAvoid = new Set<number>()
  for (const [sid, group] of objectGroups) {
    const template = catalogById.get(sid)
    // The walk-onto placeholders (random-res/-squad/-item) mark their whole 3x3 as entrance and block nothing.
    if (!template || NON_BLOCKING_SPAWNER_SIDS.has(sid)) continue
    for (let i = 0; i < group.nodes.length; i++) {
      for (const c of computeFootprintTiles(template, group.nodes[i] % atlas.atlasWidth, Math.floor(group.nodes[i] / atlas.atlasWidth), group.rotations[i])) {
        if (c.value !== 2) continue
        entranceCells.add(c.z * atlas.atlasWidth + c.x)
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) entranceAvoid.add((c.z + dz) * atlas.atlasWidth + c.x + dx)
      }
    }
  }
  const waterPortals = buildWaterPortals({
    width: atlas.atlasWidth, height: atlas.atlasHeight, catalogById, waterMap: out.waterMap, levelsMap: out.levelsMap,
    landNodes: floorNodes, solidClaimed, entranceNodes: entranceCells, avoidNodes: entranceAvoid, rng,
    objectNodes: [...objectGroups.entries()].flatMap(([, group]) => group.nodes),
    place: (node) => placeObject(WATER_PORTAL_SID, node),
  }, shipyardNodes)
  for (const detail of shipyardDetails) {
    detail.mappedSid = waterPortals.shipyardsConverted > 0 ? WATER_PORTAL_SID : null
    detail.note = waterPortals.shipyardsConverted > 0 ? 'Shipyard (replaced by a portal)' : 'shipyard_without_island_omit'
  }
  if (waterPortals.shipyardsConverted === 0 && shipyardDetails.length > 0) omittedReasonCounts.shipyard_without_island_omit = shipyardDetails.length
  await stage('decoration', 42)
  for (const place of volcanoScenery) place()
  for (const place of deferredScenery) place()
  for (const [layer, field] of mountainField) {
    const biomeAt = (cell: { x: number; z: number }) => (field.get(`${cell.x},${cell.z}`) as { biome: BiomeId }).biome
    let placed = 0
    for (const p of packMountainClusterVaried([...field.values()].map((v) => v.cell), biomeAt, decorationPicker, rng)) {
      const biome = biomeAt(p.anchor)
      placed += placeScenery(p.sid, atlas.targetNode(layer, p.anchor.x, p.anchor.z), (avoid) => decorationPicker.pickMountain(biome, 1, rng, avoid))
    }
    sceneryVariantCounts['mountain (merged ranges)'] = (sceneryVariantCounts['mountain (merged ranges)'] ?? 0) + placed
    sceneryPlaced += placed
  }

  // Water mountains: the same packing as a land range, from the water mountain models only.
  const waterPicker: H3DecorationPicker = {
    ...decorationPicker,
    mountainSizes: () => decorationPicker.waterMountainSizes(),
    pickMountain: (_biome, pieceSize, pickRng, avoid) => decorationPicker.pickWaterMountain(pieceSize, pickRng, avoid),
  }
  for (const [layer, field] of waterMountainField) {
    let placed = 0
    for (const p of packMountainClusterVaried([...field.values()], () => 1 as BiomeId, waterPicker, rng)) {
      placed += placeScenery(p.sid, atlas.targetNode(layer, p.anchor.x, p.anchor.z), (avoid) => decorationPicker.pickWaterMountain(1, rng, avoid))
    }
    sceneryVariantCounts['water mountains'] = (sceneryVariantCounts['water mountains'] ?? 0) + placed
    sceneryPlaced += placed
  }

  // ── Last two decoration passes (they need every object and the mountains in place) ──
  // Tiles an object stands on (or, for a walk-onto placeholder, its own tile): nothing is added there.
  const occupiedTiles = new Set<number>()
  for (const [sid, group] of objectGroups) {
    const template = catalogById.get(sid)
    for (let i = 0; i < group.nodes.length; i++) {
      occupiedTiles.add(group.nodes[i])
      if (!template || NON_BLOCKING_SPAWNER_SIDS.has(sid)) continue
      for (const c of computeFootprintTiles(template, group.nodes[i] % atlas.atlasWidth, Math.floor(group.nodes[i] / atlas.atlasWidth), group.rotations[i])) {
        if (c.value >= 1 && c.x >= 0 && c.z >= 0 && c.x < atlas.atlasWidth && c.z < atlas.atlasHeight) occupiedTiles.add(c.z * atlas.atlasWidth + c.x)
      }
    }
  }
  const oeBiomeOfNode = (node: number): keyof typeof BIOME_ROLE_REPLACEMENTS.ground | null => {
    const nx = node % atlas.atlasWidth
    const nz = Math.floor(node / atlas.atlasWidth)
    for (const [layerKey, spec] of Object.entries(atlas.layers)) {
      const x = nx - spec.offsetX
      const y = size - 1 - (nz - spec.offsetY)
      if (x < 0 || y < 0 || x >= size || y >= size) continue
      const terrain = parsed.layers[Number(layerKey)]?.[y * size + x]?.terrain
      return terrain === undefined || terrain === 8 || terrain === 9 ? null : (H3_TERRAIN_BIOME[terrain] ?? null)
    }
    return null
  }
  /** Open ground a decoration can be added on: H3 floor, dry, level 0, no road or river, nothing standing there. */
  const isOpenGround = (node: number): boolean =>
    floorNodes.has(node) && out.waterMap[node] === 0 && out.levelsMap[node] === 0 && out.roadsMap[node] === 0
    && !out.riverNodes.has(node) && !rockNodes.has(node) && !occupiedTiles.has(node)
  const walkableAt = (node: number): string | null => {
    const oe = oeBiomeOfNode(node)
    const biome = oe ? decorationPicker.walkableBiomeOf(BIOME_ROLE_REPLACEMENTS.ground[oe]) : null
    return biome === null ? null : decorationPicker.pickWalkable(biome, rng)
  }

  // In front of a mountain (the tiles with the lower tile number, toward the bottom of the map) a bare tile looks odd: a mountain or a range
  // with nothing near it stands out. Each blocking tile on the bottom edge of a mountain has this chance of getting a tree, a bush or a walkable
  // on the empty tile in front of it.
  const MOUNTAIN_FRONT_CHANCE = 0.67
  const mountainCells = new Set<number>()
  for (const [sid, group] of objectGroups) {
    const template = catalogById.get(sid)
    if (!sid.startsWith('mountain_') || !template) continue
    for (let i = 0; i < group.ids.length; i++) {
      if (!decorativeIds.has(group.ids[i])) continue
      for (const c of computeFootprintTiles(template, group.nodes[i] % atlas.atlasWidth, Math.floor(group.nodes[i] / atlas.atlasWidth), group.rotations[i])) {
        if (c.value === 1) mountainCells.add(c.z * atlas.atlasWidth + c.x)
      }
    }
  }
  let frontPlaced = 0
  for (const cell of mountainCells) {
    const node = cell - atlas.atlasWidth
    if (node < 0 || mountainCells.has(node) || rng() >= MOUNTAIN_FRONT_CHANCE) continue
    if (!isOpenGround(node)) continue
    const oe = oeBiomeOfNode(node)
    const biome = oe ? decorationPicker.biomeIdOf(BIOME_ROLE_REPLACEMENTS.ground[oe]) : null
    const kind = Math.floor(rng() * 3)
    let sid: string | null = null
    if (biome !== null && kind === 0 && decorationPicker.hasTrees(biome) && !entranceAvoid.has(node)) sid = decorationPicker.pickTree(biome, rng)
    else if (biome !== null && kind === 1 && !entranceAvoid.has(node)) sid = decorationPicker.pickBush(biome, rng)
    sid ??= walkableAt(node)
    if (sid === null) continue
    const placed = placeScenery(sid, node, null)
    if (placed > 0) { occupiedTiles.add(node); frontPlaced += placed }
  }
  sceneryVariantCounts['mountain fronts'] = frontPlaced
  sceneryPlaced += frontPlaced

  // The last pass: more walkable decoration. Every open tile gets a random walkable of its biome with this chance.
  const WALKABLE_FILL_CHANCE = 0.33
  let fillPlaced = 0
  for (const node of floorNodes) {
    if (!isOpenGround(node) || rng() >= WALKABLE_FILL_CHANCE) continue
    const sid = walkableAt(node)
    if (sid === null) continue
    fillPlaced += placeScenery(sid, node, null)
  }
  sceneryVariantCounts['walkable fill'] = fillPlaced
  sceneryPlaced += fillPlaced

  // Start pockets (see start-pockets.ts): every tile H3 blocks around a walled-in start is blocked here too, with pieces the accessibility pass
  // may not delete. Placed before the pass so its flood fill starts from the sealed pocket.
  const groundTruthWalkable = buildGroundTruthWalkableSet(parsed, atlas)
  // The tile an H3 hero stands on (or a town is entered from) is its visit cell, not the object's anchor: the anchor can be a blocked tile.
  const startNodes: number[] = []
  for (const record of parsed.records) {
    if (!HERO_OBJECT_IDS.has(record.templateObjectId) && record.templateObjectId !== OBJECT_TOWN && record.templateObjectId !== OBJECT_RANDOM_TOWN) continue
    if (typeof record.owner !== 'number' || record.owner >= 8) continue
    const cell = visitCellOe(record.templateVisitMask, record.x, record.y, record.layer, atlas)
    if (cell) startNodes.push(cell.z * atlas.atlasWidth + cell.x)
  }
  const pocketWalkable = new Set<number>([...groundTruthWalkable, ...startNodes])
  for (const record of parsed.records) {
    const cell = visitCellOe(record.templateVisitMask, record.x, record.y, record.layer, atlas)
    if (cell) pocketWalkable.add(cell.z * atlas.atlasWidth + cell.x)
  }
  const startPockets = findStartPockets(startNodes, pocketWalkable, atlas.atlasWidth, atlas.atlasHeight)
  let pocketSealsPlaced = 0
  if (startPockets.length > 0) {
    // The 3x3 hero-spawner blocks all but its entrance cell, which in a pocket a few tiles wide can wall the hero in from its own portal. Each
    // spawner is moved to the pocket tile that keeps the most portal entrances reachable.
    const spawnerTemplate = catalogById.get('hero-spawner')
    const spawnerGroup = objectGroups.get('hero-spawner')
    if (spawnerTemplate && spawnerGroup) {
      const probe = computeFootprintTiles(spawnerTemplate, 1000, 1000, 0)
      const probeEntrance = probe.find((c) => c.value === 2)
      if (probeEntrance) {
        const relSolid = probe.filter((c) => c.value === 1).map((c) => ({ dx: c.x - probeEntrance.x, dz: c.z - probeEntrance.z }))
        const entranceOf = (sid: string, node: number, rotation: number) =>
          computeFootprintTiles(catalogById.get(sid), node % atlas.atlasWidth, Math.floor(node / atlas.atlasWidth), rotation).filter((c) => c.value === 2).map((c) => c.z * atlas.atlasWidth + c.x)
        // Everything that blocks and is not decoration (a portal's own solid cell, a real object) stays where it is; decoration gives way.
        const hardBlocked = new Set<number>()
        const goals: number[] = []
        for (const [sid, group] of objectGroups) {
          for (let i = 0; i < group.ids.length; i++) {
            if (decorativeIds.has(group.ids[i]) || sealIds.has(group.ids[i])) continue
            if (sid !== 'hero-spawner') for (const cell of solidCells(sid, group.nodes[i], group.rotations[i] ?? 0)) hardBlocked.add(cell)
            if (/^portal_/.test(sid)) goals.push(...entranceOf(sid, group.nodes[i], group.rotations[i] ?? 0))
          }
        }
        for (let i = 0; i < spawnerGroup.ids.length; i++) {
          const current = entranceOf('hero-spawner', spawnerGroup.nodes[i], spawnerGroup.rotations[i] ?? 0)[0]
          const pocket = startPockets.find((candidate) => candidate.nodes.has(current))
          if (!pocket) continue
          const entrance = pickSpawnerEntrance(pocket.nodes, hardBlocked, goals.filter((g) => pocket.nodes.has(g)), relSolid, atlas.atlasWidth, atlas.atlasHeight, current)
          if (entrance !== null && entrance !== current) {
            spawnerGroup.nodes[i] = (Math.floor(entrance / atlas.atlasWidth) - (probeEntrance.z - 1000)) * atlas.atlasWidth + (entrance % atlas.atlasWidth) - (probeEntrance.x - 1000)
          }
          const placed = spawnerGroup.nodes[i]
          for (const cell of solidCells('hero-spawner', placed, spawnerGroup.rotations[i] ?? 0)) hardBlocked.add(cell)
          hardBlocked.add(entranceOf('hero-spawner', placed, spawnerGroup.rotations[i] ?? 0)[0])
          // Decoration under the new footprint goes: the tile blocks either way.
          const footprint = new Set(solidCells('hero-spawner', placed, spawnerGroup.rotations[i] ?? 0))
          for (const [sid, group] of objectGroups) {
            for (let j = group.ids.length - 1; j >= 0; j--) {
              if (!decorativeIds.has(group.ids[j]) || !solidCells(sid, group.nodes[j], group.rotations[j] ?? 0).some((cell) => footprint.has(cell))) continue
              decorativeIds.delete(group.ids[j])
              group.ids.splice(j, 1); group.nodes.splice(j, 1); group.rotations.splice(j, 1); group.levels.splice(j, 1)
            }
          }
        }
      }
    }
    // Decoration whose solid footprint reaches into a pocket is taken out: it would wall the start in from the inside. The ring tiles it covered
    // are closed again below with 1x1 pieces.
    const interior = new Set<number>(startPockets.flatMap((pocket) => [...pocket.nodes]))
    for (const [sid, group] of objectGroups) {
      for (let i = group.ids.length - 1; i >= 0; i--) {
        if (!decorativeIds.has(group.ids[i]) || !solidCells(sid, group.nodes[i], group.rotations[i] ?? 0).some((cell) => interior.has(cell))) continue
        decorativeIds.delete(group.ids[i])
        group.ids.splice(i, 1); group.nodes.splice(i, 1); group.rotations.splice(i, 1); group.levels.splice(i, 1)
      }
    }
    const placedNow: PlacedObject[] = []
    // The entrance cell of an interactable is never sealed (the object would become unreachable); a walk-onto placeholder can sit under a seal.
    const entrancesNow = new Set<number>()
    for (const [sid, group] of objectGroups) {
      for (let i = 0; i < group.ids.length; i++) {
        const node = group.nodes[i]
        if (!NON_BLOCKING_SPAWNER_SIDS.has(sid)) {
          for (const c of computeFootprintTiles(catalogById.get(sid), node % atlas.atlasWidth, Math.floor(node / atlas.atlasWidth), group.rotations[i] ?? 0)) if (c.value === 2) entrancesNow.add(c.z * atlas.atlasWidth + c.x)
        }
        placedNow.push({ key: `0:${group.ids[i]}`, type: 0, id: group.ids[i], sid, x: node % atlas.atlasWidth, z: Math.floor(node / atlas.atlasWidth), node, rotation: group.rotations[i] ?? 0 })
      }
    }
    const blockedNow = buildBlockedTileSet({ sizeX: atlas.atlasWidth, sizeZ: atlas.atlasHeight, placedObjects: placedNow, levelsMap: out.levelsMap, climbsMap: out.climbsMap, waterMap: out.waterMap }, catalog)
    // A tree or rock already standing on the ring is part of the wall too: neither the accessibility pass nor the auto-fix may delete or move it.
    const ringNodes = new Set<number>(startPockets.flatMap((pocket) => pocket.ring))
    for (const [sid, group] of objectGroups) {
      for (let i = 0; i < group.ids.length; i++) {
        if (!decorativeIds.has(group.ids[i])) continue
        if (solidCells(sid, group.nodes[i], group.rotations[i] ?? 0).some((cell) => ringNodes.has(cell))) sealIds.add(group.ids[i])
      }
    }
    for (const pocket of startPockets) {
      for (const node of pocket.ring) {
        if (blockedNow.has(node) || entrancesNow.has(node)) continue
        const oe = oeBiomeOfNode(node)
        const biome = oe ? decorationPicker.biomeIdOf(BIOME_ROLE_REPLACEMENTS.ground[oe]) : null
        sealIds.add(placeObject(decorationPicker.pickMountain(biome ?? 7, 1, rng), node, randomDecorRotation(rng)))
        blockedNow.add(node)
        pocketSealsPlaced += 1
      }
    }
  }

  // Every object (scenery, towns/spawners, everything else) has been placed
  // and clamped clear of the envelope margin by this point — safe to paint
  // the wall now.
  const paddingNodes = paintEnvelopePadding(out, atlas, floorNodes)
  // Nothing may stand on H3 rock or in the border, even when its whole footprint lies on one level there.
  const forbiddenNodes = new Set<number>([...rockNodes, ...paddingNodes])

  // Real portal linkage (propPortals was previously never emitted at all —
  // see portal-links.ts's own header) must exist before the accessibility
  // pass can treat underground-via-portal paths as reachable, rather than
  // flagging every underground object on every 2-layer map as stranded.
  await stage('reachability', 58)
  const portalLinks = linkH3Portals(h3Portals)
  for (const [a, b] of waterPortals.links) {
    portalLinks.propPortals.push({ type: 0, id: a, targetIdx: b, isActive: true }, { type: 0, id: b, targetIdx: a, isActive: true })
    portalLinks.adjacencyByObjectId.set(a, b)
    portalLinks.adjacencyByObjectId.set(b, a)
    portalLinks.linkedCount += 2
  }
  const accessibility = applyAccessibilityPass(
    objectGroups, atlas.atlasWidth, atlas.atlasHeight, out, catalog, catalogById,
    decorativeIds, portalLinks.adjacencyByObjectId, groundTruthWalkable,
    undefined, undefined, sealIds, undefined, forbiddenNodes, true,
  )

  // The game takes an object's name from its sid (Core.zip's `portal_name` for every portal), so the subterranean gates ship as a map-local clone of
  // `portal_5` with its own name, description and narrative (the custom map object mechanism: the clone's template goes into the publish zip). The
  // gates stay `portal_5` until here so every pass above and the auto-fix after see a real catalog template. Every placed `portal_5` is a gate:
  // monoliths use portal_1 to portal_3 and the shipyard portals portal_4.
  const gateGroup = objectGroups.get('portal_5')
  const gateSource = catalogById.get('portal_5')
  const customMapObjects: CustomMapObjectDefinition[] = []
  let gateSid: string | null = null
  if (gateGroup && gateGroup.ids.length > 0 && gateSource) {
    gateSid = mintCustomSid(mapName || title || '', 'subterranean_gate', catalog.mapObjects.map((o) => o.id))
    localizationTokens[`${gateSid}_name`] = 'Subterranean Gate'
    localizationTokens[`${gateSid}_description`] = 'Teleports the visiting hero to the gate on the other level.'
    localizationTokens[`${gateSid}_narrativeDescription`] = 'A passage between the surface and the dark below.'
    customMapObjects.push({
      id: gateSid,
      sourceObjectId: 'portal_5',
      template: { ...gateSource.raw, id: gateSid, name: `${gateSid}_name`, description: `${gateSid}_description`, narrativeDescription: `${gateSid}_narrativeDescription` },
      // Portals' logic is just `{id, goodsValue}` under objects_logic/portals (Core.zip), cloned into the same folder like every custom object.
      logic: { id: gateSid, goodsValue: 0 },
      logicSourcePath: 'portals',
    })
  }
  const objects = Array.from(objectGroups.entries()).map(([sid, g]) => ({ sid: sid === 'portal_5' && gateSid ? gateSid : sid, ...g }))
  const squads = Array.from(squadGroups.entries()).map(([sid, g]) => ({ sid, ...g }))

  const decoder = new TextDecoder('utf-8')
  const templateB1 = JSON.parse(decoder.decode(template.chunks[0])) as Record<string, unknown>
  const templateB2 = JSON.parse(decoder.decode(template.chunks[1])) as Record<string, unknown>
  const templateB3Text = template.chunks[2] ? decoder.decode(template.chunks[2]) : '{"dialogs":{"lines":[]},"quests":{"quests":[]}}'

  // See map-write.ts's buildBlankMap() comment: the hash/hashSum are never
  // cloned from the template like everything else here — every real sample
  // checked has its own distinct value, changing even on a same-content
  // resave, so it's an opaque per-map identity the game keys recognition
  // on, not a content checksum. Cloning the template's fixed value made
  // every H3-imported map collide on the same identity, confirmed via real
  // player.log testing to be why the game silently refused to recognize
  // any map imported this way.
  const mapHash = generateMapHash()

  // The H3 victory condition as win conditions. The town a capture-the-town victory names is found by its source position: a player's start
  // city gives Capital Hold, a neutral town City Hold (and that town is marked).
  let winPlan = planH3WinConditions(parsed.header.victory)
  let cityHoldId: number | null = null
  if (winPlan.captureCity) {
    const target = winPlan.captureCity
    let best: { index: number; dist: number } | null = null
    for (const city of cityCandidates) {
      if (city.sourceZ !== target.z) continue
      const dist = Math.max(Math.abs(city.sourceX - target.x), Math.abs(city.sourceY - target.y))
      if (dist <= 3 && (best === null || dist < best.dist)) best = { index: city.index, dist }
    }
    const neutralId = best ? neutralTownIds.get(best.index) : undefined
    winPlan = finishH3WinPlan(winPlan, !best ? 'missing' : neutralId !== undefined ? 'neutral' : ownership.finalOwnerByCityIndex.has(best.index) ? 'player' : 'missing')
    if (neutralId !== undefined && winPlan.ids.includes('city-hold')) cityHoldId = neutralId
  }
  const winEntries = applyWinConditionEntries(
    (templateB2.settings as { mapWinConditions?: Record<string, unknown>[] } | undefined)?.mapWinConditions ?? [],
    winEntryOptions(winPlan.ids, H3_WIN_OPTIONS),
  )

  const b1 = {
    ...templateB1,
    // The H3 map's own name and description are the in-game title and description (the file name when the H3 map has no title).
    title: title.trim() || (mapName ?? ''),
    desc: parsed.header.description,
    hashSum: mapHash,
    sizeX: atlas.atlasWidth,
    sizeZ: atlas.atlasHeight,
    spawns: { playersCount: ownership.finalOwners.length, spawns: block1Spawns, takenHeroes: [] as string[] },
    startSettings: {
      ...((templateB1.startSettings as Record<string, unknown>) ?? {}),
      DefeatAllEnemiesEnabled: winPlan.ids.includes('classic'),
    },
    economicDifficulties: FULL_DIFFICULTIES,
    aiDifficulties: FULL_DIFFICULTIES,
    neutralDifficulties: FULL_DIFFICULTIES,
    quickStartDifficulties: FULL_DIFFICULTIES,
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
    squads,
    markers: [] as unknown[],
    objectsFreeId: nextId,
    squadsFreeId: nextSquadId,
    markersFreeId: 0,
    views,
    areas,
    settings: {
      ...((templateB2.settings as Record<string, unknown>) ?? {}),
      mapWinConditions: winEntries,
      // Pairs with every propRandomSquads row's own isAutobatle:true —
      // auto-battle is allowed against neutral/guard stacks, not against a
      // real enemy hero's army (a real OE-format fact, not H3-specific —
      // see CLAUDE.md's random-squad notes).
      disableAutoBattleAgainstEnemyHeroes: true,
      economicDifficulties: FULL_DIFFICULTIES,
      aiDifficulties: FULL_DIFFICULTIES,
      neutralDifficulties: FULL_DIFFICULTIES,
      quickStartDifficulties: FULL_DIFFICULTIES,
    },
    // Start from the template's own ~29-table objectsProperties shape (every
    // other table stays a template-provided empty array — a real, freshly
    // opened map is expected to have all of them present, not just the ones
    // this phase populates) and override only what this phase actually fills.
    objectsProperties: {
      ...((templateB2.objectsProperties as Record<string, unknown>) ?? {}),
      propCities, propOwners, propSpawns, propRandomSquads, propRandomItems, propGrowthUnits, propHeroes, propSquads,
      propCitiesHold: cityHoldId === null ? [] : [{ type: 0, id: cityHoldId, isCityHold: true }],
      propPortals: portalLinks.propPortals,
    },
  }

  const templateB4 = template.chunks[3] ? JSON.parse(decoder.decode(template.chunks[3])) as Record<string, unknown> : {}
  const b4 = {
    comment: templateB4.comment ?? '',
    aiRolesId: templateB4.aiRolesId ?? '',
    counters: [] as unknown[],
    interruptions: [] as unknown[],
    quests: [...globalEventQuests],
  }
  // Real editors never emit a 4th chunk when it would be entirely default —
  // see buildBlankMap's own doc comment (map-write.ts) for the real-map
  // evidence. Only include it here when the import actually produced real
  // content (a main quest or global event quests) to put in it.
  const b4IsDefault = b4.comment === '' && b4.aiRolesId === '' && b4.counters.length === 0
    && b4.interruptions.length === 0 && b4.quests.length === 0

  const container: MapContainer = {
    hash: new TextEncoder().encode(mapHash),
    version: template.version,
    separator: template.separator,
    chunks: [
      new TextEncoder().encode(JSON.stringify(b1)),
      new TextEncoder().encode(JSON.stringify(b2)),
      new TextEncoder().encode(templateB3Text),
      ...(b4IsDefault ? [] : [new TextEncoder().encode(JSON.stringify(b4))]),
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
        h3Id: inst.h3Id, subId: inst.subId, h3Name: inst.h3Name, defName: inst.defName, category: inst.category,
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
      outOfEnvelopeCount, clusterCellsClipped, winConditions: winPlan.ids, unsupportedVictory: winPlan.unsupported,
      shipyardsFound: shipyardNodes.length, shipyardPortals: waterPortals.portals, shipyardIslands: waterPortals.islands,
      anchorFallbacks,
      portalsLinked: portalLinks.linkedCount, portalsUnpaired: portalLinks.unpairedCount,
      accessibilityTargetsChecked: accessibility.targetsChecked, accessibilityDecorRemoved: accessibility.decorRemoved,
      accessibilityTargetsNudged: accessibility.targetsNudged, accessibilityStillUnreachable: accessibility.stillUnreachable,
      groundTruthTilesChecked: accessibility.groundTruthTilesChecked, groundTruthDecorRemoved: accessibility.groundTruthDecorRemoved,
      groundTruthStillBlocked: accessibility.groundTruthStillBlocked,
      startPockets: startPockets.length, startPocketSeals: pocketSealsPlaced,
      riverTilesConverted: out.riverNodes.size,
      detailRows,
    },
    localizationTokens,
    customMapObjects,
    dialogFlows,
    sealIds: [...sealIds],
    forbiddenNodes,
  }
}
