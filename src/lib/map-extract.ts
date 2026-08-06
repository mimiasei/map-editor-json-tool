// ─── Map data extraction ──────────────────────────────────────────────────────
// Derives editor-friendly data structures from raw parsed .map blocks.

import type { RawMapBlocks, RawMapBlock2 } from '@/lib/map-parser'
import type {
  MapContext,
  PlayerSpawn,
  MapEntity,
  HeroAssignment,
  BanInfo,
  HeroPlacement,
  CreaturePlacement,
  ArtifactPlacement,
  PlacedObject,
} from '@/types/map-context'
import type { ScenarioFile } from '@/types/scenario'

// ─── buildPlacedObjects ───────────────────────────────────────────────────────
// `objects[]`, `squads[]` and `markers[]` are three SEPARATE id-namespaces
// that can (and do, in real maps) collide on the same numeric id — e.g. id 8
// meaning "city-spawner" in objects[] and "squad_c_angel" in squads[] on the
// same map (issue #122). Every objectsProperties table that references one of
// these by id also carries a `type` discriminator (0=objects, 1=markers,
// 2=squads) for exactly this reason — that pair, never id alone, is this
// module's join key. This is the single place placement + coordinates are
// resolved; every per-category list below (entities, heroPlacements,
// creaturePlacements, artifactPlacements) derives from its output rather than
// re-deriving its own id→node lookup.

/**
 * Every placed object/squad/marker instance on the map, enriched with its
 * propEntities SID and propsName display name where set. Never throws — an
 * instance with unresolvable coordinates (sizeX unknown, or a node/id pair
 * malformed) is simply skipped.
 */
export function buildPlacedObjects(
  b2: RawMapBlock2,
  nodeToCoord: (node: number) => { x: number; z: number } | undefined,
  entitySidByKey: Map<string, string>,
  displayNameByKey: Map<string, string>,
): PlacedObject[] {
  const placed: PlacedObject[] = []

  const push = (type: 0 | 1 | 2, id: number, sid: string, node: number, rotation?: number, level?: number) => {
    const coord = nodeToCoord(node)
    if (!coord) return
    const key = `${type}:${id}`
    placed.push({
      key, type, id, sid, node, ...coord,
      rotation, level,
      entitySid: entitySidByKey.get(key),
      displayName: displayNameByKey.get(key),
    })
  }

  // type 0 — objects[]
  for (const obj of b2.objects ?? []) {
    if (typeof obj.sid !== 'string') continue // string[] sid form never observed in real maps; skip defensively
    const { ids, nodes, rotations, levels } = obj
    if (!Array.isArray(ids) || !Array.isArray(nodes)) continue
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const node = nodes[i]
      if (typeof id !== 'number' || typeof node !== 'number') continue
      push(0, id, obj.sid, node, rotations?.[i], levels?.[i])
    }
  }

  // type 2 — squads[] (fixed/scripted unit placements, separate from objects[])
  for (const sq of b2.squads ?? []) {
    if (typeof sq.sid !== 'string') continue
    const { ids, nodes } = sq
    if (!Array.isArray(ids) || !Array.isArray(nodes)) continue
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const node = nodes[i]
      if (typeof id !== 'number' || typeof node !== 'number') continue
      push(2, id, sq.sid, node)
    }
  }

  // type 1 — markers[] (editor-only zone-shape annotations)
  for (const m of b2.markers ?? []) {
    if (typeof m.sid !== 'string' || typeof m.id !== 'number' || typeof m.node !== 'number') continue
    push(1, m.id, m.sid, m.node)
  }

  return placed
}

// ─── extractMapContext ────────────────────────────────────────────────────────

/**
 * Extract read-only MapContext from raw map blocks.
 * All fields have safe fallbacks — never throws.
 */
export function extractMapContext(raw: RawMapBlocks): MapContext {
  const b1 = raw.block1
  const b2 = raw.block2

  // ── Spawns ──────────────────────────────────────────────────────────────────
  // b1.spawns is an object { playersCount, spawns: [...], takenHeroes }
  const spawnsObj = b1.spawns as unknown
  const rawSpawns: unknown[] = Array.isArray(spawnsObj)
    ? spawnsObj
    : Array.isArray((spawnsObj as Record<string, unknown>)?.spawns)
      ? (spawnsObj as Record<string, unknown>).spawns as unknown[]
      : []
  const spawns: PlayerSpawn[] = rawSpawns.map((s, i) => {
    const sp = s as Record<string, unknown>
    return {
      index: i,
      owner: sp.owner !== undefined ? String(sp.owner) : '',
      factionSid: sp.factionSid !== undefined ? String(sp.factionSid) : '',
      heroSid: sp.heroSid !== undefined ? String(sp.heroSid) : '',
      colorId: typeof sp.colorId === 'number' ? sp.colorId : i,
      isLocked: Boolean(sp.isLocked),
    }
  })

  // ── Ban info ─────────────────────────────────────────────────────────────────
  const bd = b1.banInfoData ?? {}
  const banInfo: BanInfo = {
    bannedHeroes: bd.bannedHeroes ?? [],
    bannedUnits: bd.bannedUnits ?? [],
    bannedMagics: bd.bannedMagics ?? [],
    bannedItems: bd.bannedItems ?? [],
    bannedSkills: bd.bannedSkills ?? [],
  }

  // ── Entities (propEntities — user-defined named objects) ─────────────────────
  const propEntities = b2.objectsProperties?.propEntities ?? []
  // sizeX: Block 2 uses sizeX_ key; fall back to Block 1 sizeX
  const sizeX = (b2 as Record<string, unknown>).sizeX_ as number | undefined ?? b1.sizeX ?? 0

  function nodeToCoord(node: number): { x: number; z: number } | undefined {
    if (sizeX <= 0) return undefined
    return { x: node % sizeX, z: Math.floor(node / sizeX) }
  }

  // propEntities SID by (type, id) — the same join key used everywhere below.
  const entitySidByKey = new Map<string, string>()
  for (const e of propEntities) {
    if (typeof e.sid !== 'string' || !e.sid.trim() || e.id === undefined) continue
    const key = `${e.type ?? ''}:${e.id}`
    if (!entitySidByKey.has(key)) entitySidByKey.set(key, e.sid)
  }

  // Custom display names (objectsProperties.propsName, issue #120) — keyed by
  // the same (type, id) pair propEntities uses to join into objects[]. The
  // game itself doesn't dedupe this table (observed in a real sample map with
  // 3 literal duplicate entries for one id) — first match wins, matching the
  // write side's policy in map-write.ts.
  const displayNameByKey = new Map<string, string>()
  for (const p of b2.objectsProperties?.propsName ?? []) {
    if (typeof p.nameTitle !== 'string' || !p.nameTitle.trim() || p.id === undefined) continue
    const key = `${p.type ?? ''}:${p.id}`
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, p.nameTitle)
  }

  // Every placed object/squad/marker, correctly disambiguated by (type, id) —
  // see buildPlacedObjects() above for why this replaces a plain id→node map.
  const placedObjects = buildPlacedObjects(b2, nodeToCoord, entitySidByKey, displayNameByKey)
  const placedByKey = new Map(placedObjects.map((p) => [p.key, p]))

  const entities: MapEntity[] = propEntities
    .filter((e) => typeof e.sid === 'string' && e.sid.trim() !== '')
    .map((e) => {
      const type = e.type ?? ''
      const id = e.id ?? -1
      const entity: MapEntity = { sid: e.sid as string, id, type }
      const placedEntry = placedByKey.get(`${type}:${id}`)
      if (placedEntry) {
        entity.x = placedEntry.x
        entity.z = placedEntry.z
        if (placedEntry.displayName) entity.displayName = placedEntry.displayName
      }
      return entity
    })

  // ── Spawner heroes as entities (issue #96) ─────────────────────────────────
  // A hero placed through a spawner never gets an entity SID, because a hero is
  // already unique by its own SID — that is what scripts reference. Without this
  // those heroes are missing from the sidebar and from mapEntity autocomplete.
  //
  // Two kinds of object can spawn a hero, and the game has used at least four
  // sids for them across map versions (hero-spawner, city-spawner, random-hero,
  // random-city). The sid names the editor tool, not the behaviour — `random-hero`
  // objects in shipped maps carry a specific hero — so this keys off propHeroes
  // and propCities instead of matching any object sid.
  //
  // A hero is included only when it will actually spawn with a fixed SID:
  //   * the hero is specified, not random. Shipped maps signal random twice
  //     (isDefined:false AND heroSid:"random"); both must pass, so a future map
  //     version setting only one still behaves.
  //   * for a city spawner, its hero slot is switched on. A city spawner spawns a
  //     city and *optionally* a hero alongside it, so an author who configures a
  //     hero and then unticks the slot can leave a stale propHeroes entry behind
  //     that never spawns. Objects with no propCities entry are pure hero
  //     spawners and have no slot to check.
  const propHeroes = b2.objectsProperties?.propHeroes ?? []
  const propCities = b2.objectsProperties?.propCities ?? []
  const cityById = new Map<number, { spawnHero?: boolean }>()
  for (const c of propCities) {
    if (typeof c?.id === 'number') cityById.set(c.id, c)
  }
  const namedSids = new Set(entities.map((e) => e.sid))

  for (const h of propHeroes) {
    const heroSid = typeof h.heroSid === 'string' ? h.heroSid.trim() : ''
    if (!heroSid) continue
    if (h.isDefined !== true) continue
    if (heroSid.toLowerCase() === 'random') continue
    // City spawner with its hero slot off — the hero never spawns.
    const city = h.id !== undefined ? cityById.get(h.id) : undefined
    if (city && city.spawnHero !== true) continue
    // Already covered — either the author named this spawner, or a second spawner
    // uses the same hero.
    if (namedSids.has(heroSid)) continue
    namedSids.add(heroSid)

    const entity: MapEntity = {
      sid: heroSid,
      id: h.id ?? -1,
      type: h.type ?? '',
      source: 'heroSpawner',
    }
    // Spawners are always plain objects (type 0) in every real map observed,
    // but resolve via placedByKey rather than a bare id lookup regardless —
    // consistent with everything else here, and safe if that ever changes.
    const placedEntry = placedByKey.get(`${h.type ?? 0}:${entity.id}`)
    if (placedEntry) { entity.x = placedEntry.x; entity.z = placedEntry.z }
    entities.push(entity)
  }

  // ── Hero placements (propHeroes → spawner node coords) ─────────────────────
  const heroPlacements: HeroPlacement[] = propHeroes
    .filter((h) => typeof h.heroSid === 'string' && h.heroSid.trim() !== '' && h.id !== undefined)
    .flatMap((h) => {
      const placedEntry = placedByKey.get(`${h.type ?? 0}:${h.id}`)
      if (!placedEntry) return []
      return [{ heroSid: h.heroSid as string, x: placedEntry.x, z: placedEntry.z }]
    })

  // ── Creature placements (propSquads → guard-object or squads[] node coords) ─
  // propSquads' own `type` says which namespace `id` belongs to: a guard squad
  // co-located with a regular object (0) or a fixed placement in the separate
  // squads[] array (2) — both occur in real maps (issue #122), so this cannot
  // default to one or the other.
  const propSquads = b2.objectsProperties?.propSquads ?? []
  const creaturePlacementSet = new Set<string>()
  const creaturePlacements: CreaturePlacement[] = []
  for (const ps of propSquads) {
    if (ps.id === undefined) continue
    const placedEntry = placedByKey.get(`${ps.type ?? 0}:${ps.id}`)
    if (!placedEntry) continue
    const coord = { x: placedEntry.x, z: placedEntry.z }
    const seenUnits = new Set<string>()
    for (const up of ps.unitProps ?? []) {
      if (typeof up.sid !== 'string' || !up.sid.trim()) continue
      if (seenUnits.has(up.sid)) continue // skip duplicate slots within same squad
      seenUnits.add(up.sid)
      const key = `${up.sid}:${coord.x}:${coord.z}`
      if (creaturePlacementSet.has(key)) continue
      creaturePlacementSet.add(key)
      creaturePlacements.push({ unitSid: up.sid, ...coord })
    }
  }

  // ── Artifact placements (objects with _artifact suffix) ─────────────────────
  const artifactPlacements: ArtifactPlacement[] = []
  const artifactPlacementSet = new Set<string>()
  for (const p of placedObjects) {
    if (p.type !== 0 || !p.sid.endsWith('_artifact')) continue
    const key = `${p.sid}:${p.x}:${p.z}`
    if (artifactPlacementSet.has(key)) continue
    artifactPlacementSet.add(key)
    artifactPlacements.push({ sid: p.sid, x: p.x, z: p.z })
  }

  // ── Hero assignments (propHeroes) ─────────────────────────────────────────────
  const heroes: HeroAssignment[] = propHeroes
    .filter((h) => typeof h.heroSid === 'string' && h.heroSid.trim() !== '')
    .map((h) => ({
      heroSid: h.heroSid as string,
      id: h.id ?? -1,
      isDefined: h.isDefined ?? false,
    }))

  // ── Object SIDs (Block 2 objects) ─────────────────────────────────────────────
  const sidSet = new Set<string>()
  for (const obj of b2.objects ?? []) {
    const sid = obj.sid
    if (typeof sid === 'string' && sid.trim() !== '') {
      sidSet.add(sid)
    } else if (Array.isArray(sid)) {
      for (const s of sid) {
        if (typeof s === 'string' && s.trim() !== '') sidSet.add(s)
      }
    }
  }

  return {
    mapName: b2.mapName ?? '',
    title: b1.title ?? '',
    desc: b1.desc ?? '',
    sizeX: b1.sizeX ?? 0,
    sizeZ: b1.sizeZ ?? 0,
    spawns,
    entities,
    heroes,
    banInfo,
    objectSids: Array.from(sidSet),
    heroPlacements,
    creaturePlacements,
    artifactPlacements,
    placedObjects,
    tilesMap: Array.isArray(b2.tilesMap) ? b2.tilesMap : [],
    waterMap: Array.isArray(b2.waterMap) ? b2.waterMap : [],
  }
}

// ─── extractScenario ──────────────────────────────────────────────────────────

// Fields that exist in Block 4 but are engine-only defaults — strip them so
// the sidecar JSON matches what the game expects when the editor round-trips.
const ENGINE_COUNTER_FIELDS = new Set(['sharing', 'minValue', 'maxValue'])

/**
 * Extract a ScenarioFile from Block 4 of the raw map blocks.
 * Strips engine-only counter fields (sharing, minValue, maxValue).
 * Returns an empty scenario if Block 4 has no usable data.
 */
export function extractScenario(raw: RawMapBlocks): ScenarioFile {
  const b4 = raw.block4
  console.log('[map-extract] block4 raw:', {
    keys: Object.keys(b4),
    countersCount: (b4.counters ?? []).length,
    interruptionsCount: (b4.interruptions ?? []).length,
    questsCount: (b4.quests ?? []).length,
    countersFirst: (b4.counters ?? []).slice(0, 2),
    questsFirst: (b4.quests ?? []).slice(0, 2),
  })

  const counters = (b4.counters ?? []).map((c) => {
    if (c && typeof c === 'object') {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
        if (!ENGINE_COUNTER_FIELDS.has(k)) out[k] = v
      }
      return out
    }
    return c
  }) as ScenarioFile['counters']

  return {
    counters,
    interruptions: (b4.interruptions ?? []) as ScenarioFile['interruptions'],
    quests: (b4.quests ?? []) as ScenarioFile['quests'],
  }
}
