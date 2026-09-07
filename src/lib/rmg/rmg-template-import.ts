// ─── Real game RMG template import (issue #210, Stage 1) ────────────────────
// Imports a real `.rmg.json` game template's own topology — zones (name,
// size, which one is which player's spawn) and connections (road/portal/
// skip) — as an alternative to `zone-graph.ts`'s `buildZoneGraph` fixed
// ring, PLUS a handful of per-zone value/balance fields layered on top of
// this generator's own existing population logic (issue #210 runner-up
// milestone, added later than the rest of this file): `guardCutoffValue`,
// `guardedContentValue`/`resourcesValue` (+ `...PerArea`), named
// `contentCountLimits[]` references, and neutral-city faction
// `differentFrom` constraints — see each field's own doc comment below and
// `zone-population.ts`'s own consuming code for exactly how each is used.
// Still deliberately NOT full template consumption: content POOLS (which
// specific objects a zone's own `guardedContentPool`/`unguardedContentPool`/
// `resourcesContentPool` names resolve to) and the full multi-main-object-
// per-zone placement model are a real, much larger undertaking, tracked
// separately, not attempted here — this generator still places its own
// single mine/treasure-loop/guard per zone, just tuned by the real values
// above when a template provides them.
//
// Schema confirmed two ways: this repo's own `maps/templates/*.rmg.json`
// (~90 real game templates) and a third-party template editor's full
// TypeScript schema (github.com/GendizerGaming/olden-era-rmg-editor's
// `src/types/rmg.ts`) — only the handful of fields actually read here are
// modeled, matching this codebase's own `RawMapBlock1`/`RawMapBlock2`
// convention of a typed subset over a `[key: string]: unknown` catch-all
// rather than a full schema port.
//
// Real example confirmed directly (`Crossroads.rmg.json`): a Spawn main
// object's own `spawn` field is `"Player1"`/`"Player2"` (not a bare letter
// as first guessed) — `playerIndexFromSpawnField` parses the trailing
// number. Connections are overwhelmingly `connectionType: "Direct"` with
// `road: true`; a `"Portal"` connection has `road: false`.
//
// A real, confirmed correction: `"Proximity"` connections are NOT always
// safely skippable — `Galaxy.rmg.json`'s own graph only stays connected at
// all because of two `Proximity` connections linking its two player
// "hemispheres" (every other connection is internal to one hemisphere).
// So EVERY parseable connection (any `from`/`to` that resolve to real
// zones) becomes a real `ZoneGraph` edge, preserving the template
// author's own connectivity exactly — whether anything gets PAINTED for
// it (road vs portal vs nothing) is a separate, secondary decision:
// `road: true`/`connectionType: "Direct"` paints a road, `"Portal"` paints
// a portal, and everything else (`Proximity`, `GladiatorArena`, and any
// other real-schema type this milestone doesn't special-case) becomes a
// plain, unpainted connectivity-only edge — present in the graph (so
// distances/reachability are correct) but invisible on the map, same as
// how a `Proximity` "spring" isn't a real passage in the reference editor
// either.

import type { ZoneGraph, ZoneSpec } from './zone-graph'

interface RawFactionConstraint {
  type?: string
  args?: string[]
}

interface RawMainObject {
  type?: string
  spawn?: string
  faction?: RawFactionConstraint
  [key: string]: unknown
}

interface RawZone {
  name?: string
  size?: number
  layout?: string
  mainObjects?: RawMainObject[]
  /** Below this rolled value, no guard is placed at all (1500-2500 seen
   *  across real templates) — see guard-value-bands.ts's own
   *  GUARD_VALUE_CUTOFF doc comment for why this generator's own default
   *  deliberately does NOT match the real absolute number; a per-zone value
   *  read directly from the picked template is a different, more targeted
   *  case than that earlier rejected global port. */
  guardCutoffValue?: number
  /** Value-budget fields (issue #210 runner-up milestone) — real templates
   *  always ship a flat `xValue` alongside a `xValuePerArea` scaled by the
   *  zone's own `size`; combined in `combineValueAndArea` below. */
  guardedContentValue?: number
  guardedContentValuePerArea?: number
  resourcesValue?: number
  resourcesValuePerArea?: number
  /** Names of this zone's own entries in the template's top-level
   *  `contentCountLimits[]` (an array of NAMED limit sets, e.g.
   *  `content_limits_spawn`) — resolved against `limitSetsByName` below. */
  contentCountLimits?: string[]
  [key: string]: unknown
}

interface RawContentCountLimit {
  sid?: string
  maxCount?: number
  [key: string]: unknown
}

interface RawContentCountLimitSet {
  name?: string
  limits?: RawContentCountLimit[]
  [key: string]: unknown
}

interface RawConnection {
  from?: string
  to?: string
  connectionType?: string
  road?: boolean
  [key: string]: unknown
}

interface RawVariant {
  zones?: RawZone[]
  connections?: RawConnection[]
  [key: string]: unknown
}

interface RawAmbientPickupDistribution {
  repulsion?: number
  noise?: number
  roadAttraction?: number
  obstacleAttraction?: number
  groupSizeWeights?: number[]
}

interface RawZoneLayout {
  name?: string
  obstaclesFill?: number
  lakesFill?: number
  minLakeArea?: number
  ambientPickupDistribution?: RawAmbientPickupDistribution
  [key: string]: unknown
}

/** Per-zone terrain-shape overrides a real template's own `zoneLayouts[]`
 *  provides (issue #210, Stage 3a/3c) — resolved by zone id from each
 *  zone's own `layout` name reference. Every field independently optional:
 *  a zone whose layout omits a field (or has no `layout` at all) falls
 *  back to this generator's own existing flat default, same as every
 *  other per-zone override in this codebase. */
export interface ZoneLayoutOverrides {
  obstaclesFill?: number
  lakesFill?: number
  minLakeArea?: number
  ambientPickupDistribution?: RawAmbientPickupDistribution
}

interface RawGameRules {
  heroCountMin?: number
  heroCountMax?: number
  heroCountIncrement?: number
  heroHireBan?: boolean
  factionLawsExpModifier?: number
  astrologyExpModifier?: number
  bonuses?: unknown[] | unknown
  globalBans?: { items?: string[]; magics?: string[]; heroes?: string[] }
  [key: string]: unknown
}

interface RawTemplate {
  variants?: RawVariant[]
  gameRules?: RawGameRules
  globalBans?: { items?: string[]; magics?: string[]; heroes?: string[] }
  zoneLayouts?: RawZoneLayout[]
  contentCountLimits?: RawContentCountLimitSet[]
  [key: string]: unknown
}

export interface GameTemplateTopology {
  graph: ZoneGraph
  /** zone-graph edge key (`"${min}:${max}"`) -> whether that edge should be
   *  a portal instead of a normal road-eligible edge. */
  portalEdges: Set<string>
  /** zone-graph edge key -> edges that exist for connectivity/distance
   *  purposes only and should never be painted as a road OR a portal
   *  (`Proximity`/`GladiatorArena`/anything else not `road: true` or
   *  `connectionType: "Portal"`) — see this file's own header comment for
   *  why these still need to be real graph edges. */
  unpaintedEdges: Set<string>
  /** zone id -> its own resolved `zoneLayouts[]` entry (issue #210, Stage
   *  3a/3c) — empty for a zone with no `layout` reference or an
   *  unresolvable one. */
  zoneLayoutByZoneId: Map<number, ZoneLayoutOverrides>
  /** zone id -> that zone's own real `guardCutoffValue`, when present
   *  (issue #210 runner-up milestone). Empty for a zone with no such field
   *  (or when no template was imported at all) — callers fall back to
   *  their own default cutoff in that case. */
  guardCutoffValueByZoneId: Map<number, number>
  /** zone id -> that zone's own real value-budget fields, combined with
   *  their `...PerArea` counterpart (see `combineValueAndArea` below).
   *  Empty for a zone with neither field set. */
  zoneContentValueByZoneId: Map<number, ZoneContentValueOverrides>
  /** zone id -> real per-sid placement caps resolved from this zone's own
   *  named `contentCountLimits[]` references (merged across every name the
   *  zone lists, strictest maxCount wins per sid). Empty for a zone with no
   *  such references. */
  contentCountLimitsByZoneId: Map<number, { sid: string; maxCount: number }[]>
  /** neutral zone id -> the set of PLAYER zone ids a candidate neutral
   *  city placed here must have a DIFFERENT faction from, parsed from that
   *  zone's own City main object(s) `faction: {type:"FromList",
   *  args:["differentFrom: <idx> <zoneName>"]}` (real shape confirmed in
   *  `Pyramid.rmg.json`). Merges every constraint found across all of a
   *  zone's City main objects, since this generator places at most one
   *  candidate city per zone (unlike the real format's own multiple-
   *  alternative-object model). Empty for a zone with no such constraint —
   *  callers fall back to "differ from every player" in that case. */
  neutralCityExclusionsByZoneId: Map<number, Set<number>>
}

/** Per-zone value-budget overrides (issue #210 runner-up milestone) — see
 *  `RawZone`'s own `guardedContentValue`/`resourcesValue` doc comments. */
export interface ZoneContentValueOverrides {
  guardedContentValue?: number
  resourcesValue?: number
}

function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`
}

/** Combines a real template's flat `xValue` with its `xValuePerArea`
 *  counterpart into one effective total (`value + perArea * zoneSize`) —
 *  every real zone sampled in `maps/templates/*.rmg.json` that carries
 *  either field carries both. Not independently confirmed against the
 *  actual game engine's own formula (no engine source to check against) —
 *  flagged as the closest reasonable reading, same spirit as this
 *  generator's other real-but-unverified-formula cases. Returns undefined
 *  (not 0) when neither field is present, so callers can tell "no real
 *  data" apart from "a real, deliberate zero". */
function combineValueAndArea(value: number | undefined, perArea: number | undefined, size: number): number | undefined {
  if (value === undefined && perArea === undefined) return undefined
  return (value ?? 0) + (perArea ?? 0) * size
}

/** `"Player1"` -> `1`. Real templates confirmed to use this exact
 *  "Player<N>" shape (`Crossroads.rmg.json`'s own Spawn main objects) —
 *  throws on anything else rather than guessing a player index. */
function playerIndexFromSpawnField(spawn: string): number {
  const match = /^Player(\d+)$/.exec(spawn)
  if (!match) throw new Error(`RMG game template: unrecognized Spawn main object "spawn" value ${JSON.stringify(spawn)} (expected "Player<N>")`)
  return Number(match[1])
}

/** Parses the raw JSON text of a real `.rmg.json` game template. Throws
 *  loudly on anything unparseable/missing `variants` — same "a template a
 *  user opens should either load as exactly what it says, or fail loudly"
 *  convention `template.ts`'s own `parseRandomMapTemplate` already
 *  follows. */
export function parseGameTemplateJson(json: string): RawTemplate {
  const data = JSON.parse(json) as RawTemplate
  if (!Array.isArray(data.variants) || data.variants.length === 0) {
    throw new Error('RMG game template has no variants[] — not a real .rmg.json template')
  }
  return data
}

/** Real templates can have several alternative zone-graph variants — "the
 *  game picks one at random when generating a map" per the reference
 *  editor's own architecture notes. Picking one at random here on every
 *  generation reproduces that same real variety. */
export function pickGameTemplateVariant(template: RawTemplate, rng: () => number): RawVariant {
  const variants = template.variants ?? []
  return variants[Math.floor(rng() * variants.length)]
}

/**
 * Builds a `ZoneGraph` (this generator's own shape — `zone-graph.ts`)
 * directly from one real template variant's `zones[]`/`connections[]`,
 * bypassing `buildZoneGraph`'s fixed ring entirely. `ZoneSpec.size` is the
 * template's own real `zone.size` value verbatim — already the exact unit
 * `zone-layout.ts`/`zone-shape-penrose.ts` expect (both already do real
 * `sqrt(size)`-weighted placement/tiling; nothing downstream needs to
 * change to respect a real template's own size ratios).
 */
export function buildTopologyFromVariant(template: RawTemplate, variant: RawVariant): GameTemplateTopology {
  const rawZones = variant.zones ?? []
  const zoneIdByName = new Map<string, number>()
  rawZones.forEach((z, i) => { if (z.name) zoneIdByName.set(z.name, i) })

  const zones: ZoneSpec[] = rawZones.map((z, id) => {
    const spawnObject = z.mainObjects?.find((mo) => mo.type === 'Spawn')
    const isSpawn = !!spawnObject
    return {
      id,
      kind: isSpawn ? 'player' : 'neutral',
      playerIndex: isSpawn && spawnObject?.spawn ? playerIndexFromSpawnField(spawnObject.spawn) : undefined,
      size: typeof z.size === 'number' && z.size > 0 ? z.size : 1,
    }
  })

  const edges: [number, number][] = []
  const portalEdges = new Set<string>()
  const unpaintedEdges = new Set<string>()
  for (const conn of variant.connections ?? []) {
    if (!conn.from || !conn.to) continue
    const a = zoneIdByName.get(conn.from)
    const b = zoneIdByName.get(conn.to)
    if (a === undefined || b === undefined) continue
    edges.push([a, b])
    const key = edgeKey(a, b)
    if (conn.connectionType === 'Portal') portalEdges.add(key)
    else if (!(conn.connectionType === 'Direct' && conn.road)) unpaintedEdges.add(key)
  }

  // Stage 3a/3c: resolve each zone's own `layout` name reference against
  // the template's own `zoneLayouts[]` array.
  const zoneLayoutsByName = new Map<string, RawZoneLayout>()
  for (const zl of template.zoneLayouts ?? []) { if (zl.name) zoneLayoutsByName.set(zl.name, zl) }
  const zoneLayoutByZoneId = new Map<number, ZoneLayoutOverrides>()
  rawZones.forEach((z, id) => {
    if (!z.layout) return
    const layout = zoneLayoutsByName.get(z.layout)
    if (!layout) return
    zoneLayoutByZoneId.set(id, {
      obstaclesFill: layout.obstaclesFill,
      lakesFill: layout.lakesFill,
      minLakeArea: layout.minLakeArea,
      ambientPickupDistribution: layout.ambientPickupDistribution,
    })
  })

  // Runner-up milestone: resolve the template's own named
  // `contentCountLimits[]` sets (top-level) so each zone's own
  // `contentCountLimits: string[]` (a list of set NAMES, not inline
  // limits) can be resolved to real {sid,maxCount} rows.
  const limitSetsByName = new Map<string, { sid: string; maxCount: number }[]>()
  for (const set of template.contentCountLimits ?? []) {
    if (!set.name) continue
    const rows = (set.limits ?? []).filter(
      (l): l is { sid: string; maxCount: number } => typeof l.sid === 'string' && typeof l.maxCount === 'number',
    )
    limitSetsByName.set(set.name, rows)
  }

  const guardCutoffValueByZoneId = new Map<number, number>()
  const zoneContentValueByZoneId = new Map<number, ZoneContentValueOverrides>()
  const contentCountLimitsByZoneId = new Map<number, { sid: string; maxCount: number }[]>()
  const neutralCityExclusionsByZoneId = new Map<number, Set<number>>()

  rawZones.forEach((z, id) => {
    if (typeof z.guardCutoffValue === 'number') guardCutoffValueByZoneId.set(id, z.guardCutoffValue)

    const size = typeof z.size === 'number' && z.size > 0 ? z.size : 1
    const guardedContentValue = combineValueAndArea(z.guardedContentValue, z.guardedContentValuePerArea, size)
    const resourcesValue = combineValueAndArea(z.resourcesValue, z.resourcesValuePerArea, size)
    if (guardedContentValue !== undefined || resourcesValue !== undefined) {
      zoneContentValueByZoneId.set(id, { guardedContentValue, resourcesValue })
    }

    if (Array.isArray(z.contentCountLimits) && z.contentCountLimits.length > 0) {
      // Merge every named set the zone references, taking the strictest
      // (lowest) maxCount when the same sid appears in more than one —
      // every real sample checked only ever references a single set per
      // zone, but nothing in the schema forbids more.
      const merged = new Map<string, number>()
      for (const setName of z.contentCountLimits) {
        for (const row of limitSetsByName.get(setName) ?? []) {
          const existing = merged.get(row.sid)
          merged.set(row.sid, existing === undefined ? row.maxCount : Math.min(existing, row.maxCount))
        }
      }
      if (merged.size > 0) contentCountLimitsByZoneId.set(id, [...merged].map(([sid, maxCount]) => ({ sid, maxCount })))
    }

    // Neutral city faction exclusions — see neutralCityExclusionsByZoneId's
    // own doc comment above for the real shape this parses.
    for (const mo of z.mainObjects ?? []) {
      if (mo.type !== 'City' || mo.faction?.type !== 'FromList') continue
      for (const arg of mo.faction.args ?? []) {
        const match = /^differentFrom:\s*\d+\s+(.+)$/.exec(arg)
        if (!match) continue
        const otherZoneId = zoneIdByName.get(match[1])
        if (otherZoneId === undefined) continue
        if (!neutralCityExclusionsByZoneId.has(id)) neutralCityExclusionsByZoneId.set(id, new Set())
        neutralCityExclusionsByZoneId.get(id)!.add(otherZoneId)
      }
    }
  })

  return {
    graph: { zones, edges }, portalEdges, unpaintedEdges, zoneLayoutByZoneId,
    guardCutoffValueByZoneId, zoneContentValueByZoneId, contentCountLimitsByZoneId, neutralCityExclusionsByZoneId,
  }
}

/** Extracts the Stage 4 `gameRules`/`globalBans` fields this generator
 *  actually maps (`map-write.ts`'s own `GameRulesPatch` — see its header
 *  comment for the full field-by-field rationale, including why
 *  `winConditions` is deliberately never touched). Real schema quirk
 *  confirmed in `src/types/rmg.ts` upstream: `bonuses` can ship as a
 *  single object instead of an array on some templates — normalized to an
 *  array here. */
export function extractGameRulesPatch(template: RawTemplate): {
  heroCountMin?: number
  heroCountMax?: number
  heroCountIncrement?: number
  heroHireBan?: boolean
  factionLawsExpModifier?: number
  astrologyExpModifier?: number
  bonuses?: unknown[]
  globalBans?: { items?: string[]; magics?: string[]; heroes?: string[] }
} {
  const rules = template.gameRules ?? {}
  const globalBans = rules.globalBans ?? template.globalBans
  const bonuses = rules.bonuses === undefined ? undefined : Array.isArray(rules.bonuses) ? rules.bonuses : [rules.bonuses]
  return {
    heroCountMin: rules.heroCountMin,
    heroCountMax: rules.heroCountMax,
    heroCountIncrement: rules.heroCountIncrement,
    heroHireBan: rules.heroHireBan,
    factionLawsExpModifier: rules.factionLawsExpModifier,
    astrologyExpModifier: rules.astrologyExpModifier,
    bonuses,
    globalBans,
  }
}

/** Derives `scatterZoneWater`'s own `chanceByZone`/`minSizeByZone` params
 *  (Stage 3a) from an imported topology's per-zone layout overrides. A zone
 *  with no `lakesFill`/`minLakeArea` value is simply absent from the
 *  returned maps, so `scatterZoneWater`'s own flat defaults still apply
 *  there. */
export function deriveWaterOverrides(zoneLayoutByZoneId: Map<number, ZoneLayoutOverrides>): { chanceByZone: Map<number, number>; minSizeByZone: Map<number, number> } {
  const chanceByZone = new Map<number, number>()
  const minSizeByZone = new Map<number, number>()
  for (const [zoneId, overrides] of zoneLayoutByZoneId) {
    if (overrides.lakesFill !== undefined) chanceByZone.set(zoneId, overrides.lakesFill)
    if (overrides.minLakeArea !== undefined) minSizeByZone.set(zoneId, overrides.minLakeArea)
  }
  return { chanceByZone, minSizeByZone }
}

/** Derives `scatterZoneObstacles`'s own `densityByZone`/`ambientPickupByZone`
 *  params (Stage 3a/3c) the same way. */
export function deriveObstacleOverrides(zoneLayoutByZoneId: Map<number, ZoneLayoutOverrides>): {
  densityByZone: Map<number, number>
  ambientPickupByZone: Map<number, { groupSizeWeights?: number[]; obstacleAttraction?: number; repulsion?: number }>
} {
  const densityByZone = new Map<number, number>()
  const ambientPickupByZone = new Map<number, { groupSizeWeights?: number[]; obstacleAttraction?: number; repulsion?: number }>()
  for (const [zoneId, overrides] of zoneLayoutByZoneId) {
    if (overrides.obstaclesFill !== undefined) densityByZone.set(zoneId, overrides.obstaclesFill)
    if (overrides.ambientPickupDistribution) {
      const { groupSizeWeights, obstacleAttraction, repulsion } = overrides.ambientPickupDistribution
      ambientPickupByZone.set(zoneId, { groupSizeWeights, obstacleAttraction, repulsion })
    }
  }
  return { densityByZone, ambientPickupByZone }
}

/** One-call convenience: parse + pick a variant + build the topology. */
export function importGameTemplateTopology(json: string, rng: () => number): GameTemplateTopology {
  const template = parseGameTemplateJson(json)
  const variant = pickGameTemplateVariant(template, rng)
  return buildTopologyFromVariant(template, variant)
}
