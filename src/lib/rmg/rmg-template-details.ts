// ─── Real game RMG template — full detail parsing (for the "View details" dialog) ─
// Deliberately separate from rmg-template-import.ts, which only models the
// subset of a real `.rmg.json` template's fields this generator actually
// CONSUMES for generation. This module is permissive and display-only:
// it surfaces as much of a real template's own data as can be shown
// legibly, including fields no generation code reads yet (guardMultiplier,
// roads[], mandatoryContent, zoneLayouts' full shape-tuning knobs,
// valueOverrides, gameRules.winConditions, ...). Never used to drive actual
// map generation — TemplateDetailsDialog.tsx is its only consumer.
//
// `contentPools`/`contentLists` (top-level) are deliberately omitted: a
// full survey of every bundled template (`maps/templates/*.rmg.json`, ~60
// files) found both fields empty in 100% of them — nothing real to show.

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined
}
function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}
function asStringArray(v: unknown): string[] | undefined {
  const arr = asArray(v).filter((x): x is string => typeof x === 'string')
  return arr.length > 0 ? arr : undefined
}

export interface TemplateBans {
  items?: string[]
  magics?: string[]
  heroes?: string[]
}

export interface TemplateGameRules {
  heroCountMin?: number
  heroCountMax?: number
  heroCountIncrement?: number
  heroHireBan?: boolean
  encounterHoles?: boolean
  factionLawsExpModifier?: number
  astrologyExpModifier?: number
  /** Raw `gameRules.winConditions` sub-object, shown generically as
   *  key/value rows — real shape varies (classic/desertion(Day/Value)/
   *  heroLighting(Day)/lostStartCity(Day)/lostStartHero booleans+numbers). */
  winConditions?: Record<string, boolean | number | string>
}

export interface TemplateValueOverride {
  sid: string
  guardValue?: number
  variant?: number
}

export interface TemplateAmbientPickup {
  repulsion?: number
  noise?: number
  roadAttraction?: number
  obstacleAttraction?: number
  groupSizeWeights?: number[]
}

export interface TemplateZoneLayout {
  name: string
  obstaclesFill?: number
  lakesFill?: number
  minLakeArea?: number
  roadClusterArea?: number
  elevationClusterScale?: number
  ambientPickupDistribution?: TemplateAmbientPickup
}

export interface TemplateContentCountLimitSet {
  name: string
  limits: { sid: string; maxCount?: number; variant?: number }[]
}

export interface TemplateMandatoryContentSet {
  name: string
  sids: string[]
}

export interface TemplateMainObject {
  type: string
  spawn?: string
  /** Human-readable rendering of the raw `faction` constraint — see
   *  `summarizeFaction` below for exactly what each real shape becomes. */
  factionSummary?: string
  guardChance?: number
  guardValue?: number
  placement?: string
  placementArgs?: string[]
  owner?: number
  isKeyObject?: boolean
}

export interface TemplateZoneDetails {
  name: string
  kind: 'player' | 'neutral'
  playerIndex?: number
  size?: number
  layout?: string
  /** Human-readable rendering of the raw `zoneBiome` constraint — see
   *  `summarizeBiome` below. */
  biomeSummary?: string
  guardCutoffValue?: number
  guardMultiplier?: number
  guardRandomization?: number
  guardWeeklyIncrement?: number
  guardedContentValue?: number
  guardedContentValuePerArea?: number
  unguardedContentValue?: number
  unguardedContentValuePerArea?: number
  resourcesValue?: number
  resourcesValuePerArea?: number
  contentCountLimitNames: string[]
  mandatoryContentNames: string[]
  mainObjects: TemplateMainObject[]
  roadCount: number
}

export interface TemplateConnectionDetails {
  name?: string
  from: string
  to: string
  connectionType?: string
  road?: boolean
  guardValue?: number
}

export interface TemplateVariantDetails {
  zones: TemplateZoneDetails[]
  connections: TemplateConnectionDetails[]
}

export interface TemplateDetails {
  name: string
  gameMode?: string
  displayWinCondition?: string
  declaredSizeX?: number
  declaredSizeZ?: number
  gameRules: TemplateGameRules
  globalBans?: TemplateBans
  valueOverrides: TemplateValueOverride[]
  zoneLayouts: TemplateZoneLayout[]
  contentCountLimitSets: TemplateContentCountLimitSet[]
  mandatoryContentSets: TemplateMandatoryContentSet[]
  variants: TemplateVariantDetails[]
}

/** `{type:"FromList", args:["differentFrom: 0 Spawn-A", "Human"]}` etc. —
 *  the one pattern this codebase has independently reverse-engineered
 *  (rmg-template-import.ts's own neutral-city faction exclusion parsing)
 *  is rendered specially; anything else is shown as a plain, honest
 *  "type: args" fallback rather than guessed at. */
function summarizeFaction(raw: unknown): string | undefined {
  const f = asRecord(raw)
  if (!f) return undefined
  const type = asString(f.type)
  const args = asStringArray(f.args) ?? []
  if (type === 'FromList') {
    const differentFrom: string[] = []
    const other: string[] = []
    for (const arg of args) {
      const match = /^differentFrom:\s*\d+\s+(.+)$/.exec(arg)
      if (match) differentFrom.push(match[1])
      else other.push(arg)
    }
    const parts: string[] = []
    if (differentFrom.length > 0) parts.push(`Must differ from: ${differentFrom.join(', ')}`)
    if (other.length > 0) parts.push(other.join(', '))
    return parts.length > 0 ? parts.join(' — ') : 'From list'
  }
  return [type, ...args].filter(Boolean).join(': ') || undefined
}

/** `{type:"FromList", args:["Sand"]}` / `{type:"MatchMainObject", args:["0"]}`
 *  etc. — same "render the confirmed pattern nicely, everything else
 *  plainly" approach as `summarizeFaction`. */
function summarizeBiome(raw: unknown): string | undefined {
  const b = asRecord(raw)
  if (!b) return undefined
  const type = asString(b.type)
  const args = asStringArray(b.args) ?? []
  if (type === 'FromList') return args.join(', ') || undefined
  if (type === 'MatchMainObject') return `Matches this zone's own main object #${args[0] ?? '?'}`
  return [type, ...args].filter(Boolean).join(': ') || undefined
}

function parseAmbientPickup(raw: unknown): TemplateAmbientPickup | undefined {
  const a = asRecord(raw)
  if (!a) return undefined
  const groupSizeWeights = asArray(a.groupSizeWeights).filter((x): x is number => typeof x === 'number')
  const result: TemplateAmbientPickup = {
    repulsion: asNumber(a.repulsion),
    noise: asNumber(a.noise),
    roadAttraction: asNumber(a.roadAttraction),
    obstacleAttraction: asNumber(a.obstacleAttraction),
    groupSizeWeights: groupSizeWeights.length > 0 ? groupSizeWeights : undefined,
  }
  return Object.values(result).some((v) => v !== undefined) ? result : undefined
}

function parseMainObject(raw: unknown): TemplateMainObject | undefined {
  const mo = asRecord(raw)
  const type = mo && asString(mo.type)
  if (!mo || !type) return undefined
  return {
    type,
    spawn: asString(mo.spawn),
    factionSummary: summarizeFaction(mo.faction),
    guardChance: asNumber(mo.guardChance),
    guardValue: asNumber(mo.guardValue),
    placement: asString(mo.placement),
    placementArgs: asStringArray(mo.placementArgs),
    owner: asNumber(mo.owner),
    isKeyObject: asBoolean(mo.isKeyObject),
  }
}

function parseZone(raw: unknown): TemplateZoneDetails | undefined {
  const z = asRecord(raw)
  const name = z && asString(z.name)
  if (!z || !name) return undefined
  const mainObjects = asArray(z.mainObjects).map(parseMainObject).filter((mo): mo is TemplateMainObject => !!mo)
  const spawnObject = mainObjects.find((mo) => mo.type === 'Spawn')
  const playerIndex = spawnObject?.spawn ? Number(/^Player(\d+)$/.exec(spawnObject.spawn)?.[1]) : undefined
  const contentCountLimitsRaw = z.contentCountLimits
  const contentCountLimitNames = typeof contentCountLimitsRaw === 'string' ? [contentCountLimitsRaw] : (asStringArray(contentCountLimitsRaw) ?? [])
  return {
    name,
    kind: spawnObject ? 'player' : 'neutral',
    playerIndex: Number.isFinite(playerIndex) ? playerIndex : undefined,
    size: asNumber(z.size),
    layout: asString(z.layout),
    biomeSummary: summarizeBiome(z.zoneBiome),
    guardCutoffValue: asNumber(z.guardCutoffValue),
    guardMultiplier: asNumber(z.guardMultiplier),
    guardRandomization: asNumber(z.guardRandomization),
    guardWeeklyIncrement: asNumber(z.guardWeeklyIncrement),
    guardedContentValue: asNumber(z.guardedContentValue),
    guardedContentValuePerArea: asNumber(z.guardedContentValuePerArea),
    unguardedContentValue: asNumber(z.unguardedContentValue),
    unguardedContentValuePerArea: asNumber(z.unguardedContentValuePerArea),
    resourcesValue: asNumber(z.resourcesValue),
    resourcesValuePerArea: asNumber(z.resourcesValuePerArea),
    contentCountLimitNames,
    mandatoryContentNames: asStringArray(z.mandatoryContent) ?? [],
    mainObjects,
    roadCount: asArray(z.roads).length,
  }
}

function parseConnection(raw: unknown): TemplateConnectionDetails | undefined {
  const c = asRecord(raw)
  const from = c && asString(c.from)
  const to = c && asString(c.to)
  if (!c || !from || !to) return undefined
  return {
    name: asString(c.name),
    from,
    to,
    connectionType: asString(c.connectionType),
    road: asBoolean(c.road),
    guardValue: asNumber(c.guardValue),
  }
}

/** Parses the raw JSON text of a real `.rmg.json` game template into a
 *  display-ready `TemplateDetails` structure. Throws on unparseable JSON —
 *  same "fail loudly" convention as rmg-template-import.ts's own
 *  `parseGameTemplateJson`, since this is only ever called against a file
 *  the picker already validated as havings `variants[]`. */
export function parseTemplateDetails(json: string): TemplateDetails {
  const data = JSON.parse(json) as Record<string, unknown>

  const gameRulesRaw = asRecord(data.gameRules) ?? {}
  const winConditionsRaw = asRecord(gameRulesRaw.winConditions)
  const winConditions = winConditionsRaw
    ? Object.fromEntries(
        Object.entries(winConditionsRaw).filter((entry): entry is [string, boolean | number | string] =>
          typeof entry[1] === 'boolean' || typeof entry[1] === 'number' || typeof entry[1] === 'string',
        ),
      )
    : undefined

  const globalBansRaw = asRecord(gameRulesRaw.globalBans) ?? asRecord(data.globalBans)
  const globalBans: TemplateBans | undefined = globalBansRaw
    ? {
        items: asStringArray(globalBansRaw.items),
        magics: asStringArray(globalBansRaw.magics),
        heroes: asStringArray(globalBansRaw.heroes),
      }
    : undefined

  const valueOverrides = asArray(data.valueOverrides)
    .map((raw): TemplateValueOverride | undefined => {
      const v = asRecord(raw)
      const sid = v && asString(v.sid)
      if (!v || !sid) return undefined
      return { sid, guardValue: asNumber(v.guardValue), variant: asNumber(v.variant) }
    })
    .filter((v): v is TemplateValueOverride => !!v)

  const zoneLayouts = asArray(data.zoneLayouts)
    .map((raw): TemplateZoneLayout | undefined => {
      const zl = asRecord(raw)
      const name = zl && asString(zl.name)
      if (!zl || !name) return undefined
      return {
        name,
        obstaclesFill: asNumber(zl.obstaclesFill),
        lakesFill: asNumber(zl.lakesFill),
        minLakeArea: asNumber(zl.minLakeArea),
        roadClusterArea: asNumber(zl.roadClusterArea),
        elevationClusterScale: asNumber(zl.elevationClusterScale),
        ambientPickupDistribution: parseAmbientPickup(zl.ambientPickupDistribution),
      }
    })
    .filter((zl): zl is TemplateZoneLayout => !!zl)

  const contentCountLimitSets = asArray(data.contentCountLimits)
    .map((raw): TemplateContentCountLimitSet | undefined => {
      const set = asRecord(raw)
      const name = set && asString(set.name)
      if (!set || !name) return undefined
      const limits = asArray(set.limits)
        .map((l) => {
          const row = asRecord(l)
          const sid = row && asString(row.sid)
          if (!row || !sid) return undefined
          return { sid, maxCount: asNumber(row.maxCount), variant: asNumber(row.variant) }
        })
        .filter((l): l is { sid: string; maxCount: number | undefined; variant: number | undefined } => !!l)
      return { name, limits }
    })
    .filter((s): s is TemplateContentCountLimitSet => !!s)

  const mandatoryContentSets = asArray(data.mandatoryContent)
    .map((raw): TemplateMandatoryContentSet | undefined => {
      const set = asRecord(raw)
      const name = set && asString(set.name)
      if (!set || !name) return undefined
      const sids = asArray(set.content)
        .map((c) => asString(asRecord(c)?.sid))
        .filter((sid): sid is string => !!sid)
      return { name, sids }
    })
    .filter((s): s is TemplateMandatoryContentSet => !!s)

  const variants = asArray(data.variants).map((raw): TemplateVariantDetails => {
    const v = asRecord(raw) ?? {}
    return {
      zones: asArray(v.zones).map(parseZone).filter((z): z is TemplateZoneDetails => !!z),
      connections: asArray(v.connections).map(parseConnection).filter((c): c is TemplateConnectionDetails => !!c),
    }
  })

  return {
    name: asString(data.name) ?? '',
    gameMode: asString(data.gameMode),
    displayWinCondition: asString(data.displayWinCondition),
    declaredSizeX: asNumber(data.sizeX),
    declaredSizeZ: asNumber(data.sizeZ),
    gameRules: {
      heroCountMin: asNumber(gameRulesRaw.heroCountMin),
      heroCountMax: asNumber(gameRulesRaw.heroCountMax),
      heroCountIncrement: asNumber(gameRulesRaw.heroCountIncrement),
      heroHireBan: asBoolean(gameRulesRaw.heroHireBan),
      encounterHoles: asBoolean(gameRulesRaw.encounterHoles),
      factionLawsExpModifier: asNumber(gameRulesRaw.factionLawsExpModifier),
      astrologyExpModifier: asNumber(gameRulesRaw.astrologyExpModifier),
      winConditions,
    },
    globalBans,
    valueOverrides,
    zoneLayouts,
    contentCountLimitSets,
    mandatoryContentSets,
    variants,
  }
}
