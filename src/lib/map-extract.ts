// ─── Map data extraction ──────────────────────────────────────────────────────
// Derives editor-friendly data structures from raw parsed .map blocks.

import type { RawMapBlocks } from '@/lib/map-parser'
import type {
  MapContext,
  PlayerSpawn,
  MapEntity,
  HeroAssignment,
  BanInfo,
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
  const spawns: PlayerSpawn[] = (b1.spawns ?? []).map((s, i) => ({
    index: i,
    owner: s.owner ?? '',
    factionSid: s.factionSid ?? '',
    heroSid: s.heroSid ?? '',
    colorId: s.colorId ?? i,
    isLocked: s.isLocked ?? false,
  }))

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
  console.log('[map-extract] block2.objectsProperties keys:', Object.keys(b2.objectsProperties ?? {}))
  console.log('[map-extract] propEntities raw (first 5):', propEntities.slice(0, 5))
  const entities: MapEntity[] = propEntities
    .filter((e) => typeof e.sid === 'string' && e.sid.trim() !== '')
    .map((e) => ({
      sid: e.sid as string,
      id: e.id ?? -1,
      type: e.type ?? '',
    }))
  console.log('[map-extract] entities after filter:', entities.length, entities.slice(0, 5))

  // ── Hero assignments (propHeroes) ─────────────────────────────────────────────
  const propHeroes = b2.objectsProperties?.propHeroes ?? []
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
