// What a game template decides, in the terms of the random-map dialog's own controls, so the dialog can show those controls
// greyed out with the closest option. Display only: generation reads the template's real numbers (rmg-template-import.ts).

import type { RmgComplexity, RmgWaterLevel } from './classic-presets'

export interface TemplateSummary {
  playerCount: number
  heroCountMax?: number
  /** Closest dialog option and the template's own number it was derived from; absent when the template has no such data. */
  water?: { level: RmgWaterLevel; lakesFill: number }
  complexity?: { level: RmgComplexity; obstaclesFill: number }
  /** Total value budget (guarded + unguarded + resources), in the template's own units. */
  totalValue: number
}

// Quantile cut points over the 70 bundled templates (src-tauri/resources/templates, size-weighted mean of the used zone layouts):
// 11 of 70 have no lakes at all; the other 59 split into thirds at lakesFill 0.262 / 0.30. obstaclesFill splits into fifths at
// 0.262 / 0.418 / 0.48 / 0.536. The game has no such named levels: these only pick the nearest label for display.
const WATER_CUTS: [number, RmgWaterLevel][] = [[0.262, 'few'], [0.30, 'some']]
const COMPLEXITY_CUTS: [number, RmgComplexity][] = [[0.262, 'sparse'], [0.418, 'light'], [0.48, 'medium'], [0.536, 'dense']]

function pick<T>(value: number, cuts: [number, T][], last: T): T {
  // Three decimals: a size-weighted mean of 0.3 must not land above a 0.30 cut by float noise.
  const rounded = Math.round(value * 1000) / 1000
  for (const [limit, level] of cuts) if (rounded <= limit) return level
  return last
}

interface RawZoneLike {
  size?: number
  layout?: string
  mainObjects?: { type?: string }[]
  guardedContentValue?: number
  guardedContentValuePerArea?: number
  unguardedContentValue?: number
  unguardedContentValuePerArea?: number
  resourcesValue?: number
  resourcesValuePerArea?: number
}

/** Null when the text is not a template with at least one variant. */
export function summarizeGameTemplate(json: string): TemplateSummary | null {
  let t: { variants?: { zones?: RawZoneLike[] }[]; zoneLayouts?: { name?: string; lakesFill?: number; obstaclesFill?: number }[]; gameRules?: { heroCountMax?: number } }
  try { t = JSON.parse(json) } catch { return null }
  const zones = t.variants?.[0]?.zones
  if (!zones || zones.length === 0) return null
  const layouts = new Map((t.zoneLayouts ?? []).map((l) => [l.name, l]))
  let sizeSum = 0
  let lake = 0
  let obstacles = 0
  let layoutSize = 0
  let totalValue = 0
  let playerCount = 0
  for (const z of zones) {
    const size = typeof z.size === 'number' && z.size > 0 ? z.size : 1
    sizeSum += size
    if (z.mainObjects?.some((m) => m.type === 'Spawn')) playerCount++
    for (const [flat, perArea] of [[z.guardedContentValue, z.guardedContentValuePerArea], [z.unguardedContentValue, z.unguardedContentValuePerArea], [z.resourcesValue, z.resourcesValuePerArea]]) {
      totalValue += (flat ?? 0) + (perArea ?? 0) * size
    }
    const layout = z.layout ? layouts.get(z.layout) : undefined
    if (!layout) continue
    layoutSize += size
    lake += (layout.lakesFill ?? 0) * size
    obstacles += (layout.obstaclesFill ?? 0) * size
  }
  const lakesFill = sizeSum > 0 ? lake / sizeSum : 0
  const obstaclesFill = sizeSum > 0 ? obstacles / sizeSum : 0
  return {
    playerCount,
    heroCountMax: t.gameRules?.heroCountMax,
    water: layoutSize > 0 ? { level: lakesFill <= 0 ? 'none' : pick(lakesFill, WATER_CUTS, 'many'), lakesFill } : undefined,
    complexity: layoutSize > 0 ? { level: pick(obstaclesFill, COMPLEXITY_CUTS, 'very_dense'), obstaclesFill } : undefined,
    totalValue: Math.round(totalValue),
  }
}
