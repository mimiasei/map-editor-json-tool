// ─── Structural OE .map validator (issue #207 Phase 5) ───────────────────────
// A fail-closed "is this a structurally valid OE map" checker — general
// purpose, not H3-import-specific (it could gate any TSE-produced or
// TSE-edited map). Scoped to a deliberately smaller subset than the
// reference translator's own `validate_map.py` (leviritchie/homm3-olden-
// stock-translator, 1353 lines) — every check kept here is one this
// session independently cross-confirmed from at least two sources (this
// project's own CLAUDE.md/real-map-survey knowledge, and/or the reference
// project's own decision logs), not just carried over on trust. Checks
// deliberately dropped this round (not silently — just not implemented):
// - `isScenario` must be true at meta/settings — the reference asserts
//   this, but TSE's OWN bundled blank-map template (and `buildBlankMap`,
//   which never touches this field either) both leave it `false` and that
//   is this project's own already-working, real convention. Asserting the
//   opposite here would false-flag TSE's own legitimate output, so this
//   check is skipped rather than guessed at.
// - "exactly one `views[]` entry" — plausible but not independently
//   confirmed for every real map (e.g. one with an underground layer might
//   legitimately need more), so left unchecked rather than risk a false
//   positive.
// - The free-choice 4-field city/hero contract, scenery-footprint
//   re-derivation, gate-face/access-contract geometry, and every
//   victory-mode/map-event-specific check — none of those subsystems are
//   implemented by this port yet (see convert-h3m-to-map.ts's own phase
//   notes), so there is nothing real to validate against.
// - The reference project's own "ocean-basin-climb contract" (every
//   `levelsMap === -1` cell adjacent to a different level needs
//   `climbsMap = 1`) — tried and DISPROVEN against this project's own real
//   maps this session: asserting it produced violations on essentially
//   every real shipped file in `maps/*.map`, including at clearly-interior
//   positions, not just the map edge this port's own terrain-map.ts
//   already special-cased. Real Olden maps evidently don't follow the
//   reference's specific climb convention for `levelsMap === -1` cells —
//   confirmed by a follow-up survey (issue #207 Phase 6): real basin
//   perimeters carry climbs=1 on only a small, sparse, hand-placed
//   fraction of their edge, and several fully-water basins have ZERO
//   climb-1 tiles anywhere at all (water is already impassable via the
//   separate `waterMap!==0` rule, so a climb ramp out of it is pointless).
//   `terrain-map.ts`'s `applyStockOceanBasinGeometry` — the H3 importer's
//   own copy of this same reference policy, over-stamping a ramp on every
//   coastline tile — has since been removed rather than left in place; no
//   validator check is warranted here beyond that removal.

export interface ValidationResult {
  errors: string[]
}

interface RawObjectGroup {
  sid?: string
  ids?: number[]
  nodes?: number[]
  rotations?: number[]
  levels?: number[]
}

const ALLOWED_TILE_IDS = new Set([1, 2, 3, 4, 5, 6, 7])
const ALLOWED_WATER_IDS = new Set([0, 1, 2, 3, 4, 5, 6, 7])

/** `objects[]` carries `rotations`/`levels` per instance; `squads[]`/`markers[]`
 *  do not (confirmed against real maps this session — several genuine
 *  shipped maps have `squads[]` groups with `ids`/`nodes` populated and
 *  `rotations` entirely absent; requiring it there produced false
 *  positives against real, working data). Only `ids`/`nodes` are checked
 *  uniformly across all three namespaces. */
function pushArrayLengthErrors(errors: string[], groups: RawObjectGroup[], namespace: string, checkRotations: boolean): void {
  const seenIds = new Set<number>()
  for (const group of groups) {
    const ids = group.ids ?? []
    const nodes = group.nodes ?? []
    if (nodes.length !== ids.length) {
      errors.push(`${namespace} group "${group.sid}": ids/nodes length mismatch (${ids.length}/${nodes.length})`)
    }
    if (checkRotations) {
      const rotations = group.rotations ?? []
      if (rotations.length !== ids.length) {
        errors.push(`${namespace} group "${group.sid}": ids/rotations length mismatch (${ids.length}/${rotations.length})`)
      }
    }
    for (const id of ids) {
      if (seenIds.has(id)) errors.push(`${namespace} duplicate id ${id} across sid groups (real invariant: unique per (entityType, id))`)
      seenIds.add(id)
    }
  }
}

/** Validate a fully-parsed `RawMapBlocks`-shaped pair of decoded block1/block2
 *  objects (the caller already has these from `parseMapFile`/its own JSON
 *  parse — this function is intentionally decoupled from any particular
 *  container/parser type so it can validate a document still being built,
 *  not just one already round-tripped through disk). */
export function validateMapStructure(block1: Record<string, unknown>, block2: Record<string, unknown>): ValidationResult {
  const errors: string[] = []

  const sizeX = Number(block2.sizeX_ ?? 0)
  const sizeZ = Number(block2.sizeZ_ ?? 0)
  const expectedTiles = sizeX * sizeZ

  if (sizeX <= 0 || sizeX % 16 !== 0) errors.push(`sizeX_ (${sizeX}) must be a positive multiple of 16`)
  if (sizeZ <= 0 || sizeZ % 16 !== 0) errors.push(`sizeZ_ (${sizeZ}) must be a positive multiple of 16`)

  const tilesMap = (block2.tilesMap as number[]) ?? []
  const waterMap = (block2.waterMap as number[]) ?? []
  const levelsMap = (block2.levelsMap as number[]) ?? []
  const climbsMap = (block2.climbsMap as number[]) ?? []
  const roadsMap = (block2.roadsMap as number[]) ?? []
  for (const [name, arr] of [['tilesMap', tilesMap], ['waterMap', waterMap], ['levelsMap', levelsMap], ['climbsMap', climbsMap], ['roadsMap', roadsMap]] as const) {
    if (arr.length !== expectedTiles) errors.push(`${name} length ${arr.length} !== sizeX_*sizeZ_ (${expectedTiles})`)
  }

  if (tilesMap.length === expectedTiles) {
    const badTiles = new Set(tilesMap.filter((t) => !ALLOWED_TILE_IDS.has(t)))
    if (badTiles.size > 0) errors.push(`tilesMap contains non-stock tile ids: ${[...badTiles].sort().join(', ')}`)
  }
  if (waterMap.length === expectedTiles) {
    const badWater = new Set(waterMap.filter((w) => !ALLOWED_WATER_IDS.has(w)))
    if (badWater.size > 0) errors.push(`waterMap contains non-stock water ids: ${[...badWater].sort().join(', ')}`)
  }

  // No ocean-basin-climb check here — see the module doc comment above for
  // why (disproven against this project's own real map corpus).

  pushArrayLengthErrors(errors, (block2.objects as RawObjectGroup[]) ?? [], 'objects[]', true)
  pushArrayLengthErrors(errors, (block2.squads as RawObjectGroup[]) ?? [], 'squads[]', false)
  pushArrayLengthErrors(errors, (block2.markers as RawObjectGroup[]) ?? [], 'markers[]', false)

  // Compact-owner contract (CLAUDE.md: "confirmed across every real sample
  // map with no exceptions") — owners are exactly the contiguous range
  // 1..playersCount, zero gaps, zero duplicates.
  const spawns = (block1.spawns as { playersCount?: number; spawns?: Array<{ owner?: number }> }) ?? {}
  const playersCount = spawns.playersCount ?? 0
  const owners = (spawns.spawns ?? []).map((s) => s.owner).filter((o): o is number => typeof o === 'number')
  const ownerSet = new Set(owners)
  if (owners.length !== ownerSet.size) errors.push(`Block 1 spawns[] has duplicate owner values: ${owners.join(', ')}`)
  for (let owner = 1; owner <= playersCount; owner++) {
    if (!ownerSet.has(owner)) errors.push(`Block 1 spawns[] missing owner ${owner} (playersCount=${playersCount} implies 1..${playersCount} all present)`)
  }
  for (const owner of ownerSet) {
    if (owner < 1 || owner > playersCount) errors.push(`Block 1 spawns[] has out-of-range owner ${owner} (playersCount=${playersCount})`)
  }

  // random-item <-> propRandomItems 1:1 bijection + rarity range.
  const objectsProperties = (block2.objectsProperties as Record<string, unknown>) ?? {}
  const randomItemGroup = ((block2.objects as RawObjectGroup[]) ?? []).find((g) => g.sid === 'random-item')
  const randomItemObjectIds = new Set(randomItemGroup?.ids ?? [])
  const propRandomItems = (objectsProperties.propRandomItems as Array<{ id?: number; rarity?: number }>) ?? []
  const propRandomItemIds = new Set(propRandomItems.map((r) => r.id).filter((id): id is number => typeof id === 'number'))
  for (const id of randomItemObjectIds) {
    if (!propRandomItemIds.has(id)) errors.push(`random-item instance id ${id} has no matching propRandomItems row`)
  }
  for (const id of propRandomItemIds) {
    if (!randomItemObjectIds.has(id)) errors.push(`propRandomItems row id ${id} has no matching random-item instance`)
  }
  for (const row of propRandomItems) {
    if (typeof row.rarity !== 'number' || row.rarity < 0 || row.rarity > 3) {
      errors.push(`propRandomItems id ${row.id} has invalid rarity ${row.rarity} (must be 0-3)`)
    }
  }

  return { errors }
}
