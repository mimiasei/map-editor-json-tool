// ─── Map data extraction ──────────────────────────────────────────────────────
// Derives editor-friendly data structures from raw parsed .map blocks.

import type { RawMapBlocks } from '@/lib/map-parser'
import type {
  MapContext,
  PlayerSpawn,
  MapEntity,
  HeroAssignment,
  BanInfo,
  HeroPlacement,
  CreaturePlacement,
  ArtifactPlacement,
} from '@/types/map-context'
import type { ScenarioFile } from '@/types/scenario'

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

  // Build a lookup: numeric id → tile node index, from objects[].ids / objects[].nodes
  const idToNode = new Map<number, number>()
  for (const obj of b2.objects ?? []) {
    const ids = obj.ids
    const nodes = obj.nodes
    if (Array.isArray(ids) && Array.isArray(nodes)) {
      for (let i = 0; i < ids.length; i++) {
        if (typeof ids[i] === 'number' && typeof nodes[i] === 'number') {
          idToNode.set(ids[i] as number, nodes[i] as number)
        }
      }
    }
  }

  function nodeToCoord(node: number): { x: number; z: number } | undefined {
    if (sizeX <= 0) return undefined
    return { x: node % sizeX, z: Math.floor(node / sizeX) }
  }

  const entities: MapEntity[] = propEntities
    .filter((e) => typeof e.sid === 'string' && e.sid.trim() !== '')
    .map((e) => {
      const entity: MapEntity = { sid: e.sid as string, id: e.id ?? -1, type: e.type ?? '' }
      const node = idToNode.get(entity.id)
      if (node !== undefined) {
        const coord = nodeToCoord(node)
        if (coord) { entity.x = coord.x; entity.z = coord.z }
      }
      return entity
    })

  // ── Hero placements (propHeroes → spawner node coords) ─────────────────────
  const propHeroes = b2.objectsProperties?.propHeroes ?? []
  const heroPlacements: HeroPlacement[] = propHeroes
    .filter((h) => typeof h.heroSid === 'string' && h.heroSid.trim() !== '' && h.id !== undefined)
    .flatMap((h) => {
      const node = idToNode.get(h.id as number)
      if (node === undefined) return []
      const coord = nodeToCoord(node)
      if (!coord) return []
      return [{ heroSid: h.heroSid as string, ...coord }]
    })

  // ── Creature placements (propSquads → objects node coords) ─────────────────
  const propSquads = b2.objectsProperties?.propSquads ?? []
  const creaturePlacements: CreaturePlacement[] = propSquads.flatMap((ps) => {
    if (ps.id === undefined) return []
    const node = idToNode.get(ps.id)
    if (node === undefined) return []
    const coord = nodeToCoord(node)
    if (!coord) return []
    return (ps.unitProps ?? [])
      .filter((up) => typeof up.sid === 'string' && up.sid.trim() !== '')
      .map((up) => ({ unitSid: up.sid as string, ...coord }))
  })

  // ── Artifact placements (objects with _artifact suffix) ─────────────────────
  const artifactPlacements: ArtifactPlacement[] = []
  for (const obj of b2.objects ?? []) {
    if (typeof obj.sid !== 'string' || !obj.sid.endsWith('_artifact')) continue
    const ids = obj.ids
    const nodes = obj.nodes
    if (!Array.isArray(ids) || !Array.isArray(nodes)) continue
    for (let i = 0; i < ids.length; i++) {
      if (typeof nodes[i] !== 'number') continue
      const coord = nodeToCoord(nodes[i] as number)
      if (coord) artifactPlacements.push({ sid: obj.sid, ...coord })
    }
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
