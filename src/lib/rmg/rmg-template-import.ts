// ─── Real game RMG template import (issue #210, Stage 1) ────────────────────
// Imports a real `.rmg.json` game template's own TOPOLOGY ONLY — zones
// (name, size, which one is which player's spawn) and connections (road/
// portal/skip) — as an alternative to `zone-graph.ts`'s `buildZoneGraph`
// fixed ring. Everything else in this generator's own pipeline (biome
// assignment, water, decoration clustering, object population, roads/
// rivers painting) is untouched and keeps running exactly as built this
// session — this is deliberately topology-only, not full template
// consumption (content pools/zoneLayouts terrain-shape fields are a real,
// larger undertaking, tracked separately, not attempted here).
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

interface RawMainObject {
  type?: string
  spawn?: string
  [key: string]: unknown
}

interface RawZone {
  name?: string
  size?: number
  layout?: string
  mainObjects?: RawMainObject[]
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
}

function edgeKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`
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

  return { graph: { zones, edges }, portalEdges, unpaintedEdges, zoneLayoutByZoneId }
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
