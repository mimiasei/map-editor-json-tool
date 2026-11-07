// ─── Map Grid — what each zone holds ────────────────────────────────────────
// Fairness drawer only. computePlayerBalance compares land, mine distance and site counts; this adds what those sites are worth and how well
// they are guarded, per Player Area and per neutral area (the areas Map Stats lists). Each object counts in the area its own tile is painted
// with; unzoned tiles (area 0) are left out. Reward value is the catalog price (`interactablePower`), so resource piles and chests, which have no
// price, are not counted; mines are counted as daily income instead (`resValue` of res_mines/mines.json: gold 1000, the rest 1-2).

import type { MapContext } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { guardRewardRows } from './guard-reward'
import { groupPlayerStartsByZone } from './zone-ownership'

export interface ZoneEconomyRow {
  zoneId: number
  /** Player slot of the start standing in the area; undefined for a neutral area. */
  owner?: number
  /** Daily income per resource sid ('gold', 'wood', ...). */
  income: Record<string, number>
  /** Summed catalog price of the priced objects, split by whether any guard (built-in or outside) stands at them. */
  guardedValue: number
  unguardedValue: number
  /** Strong and very strong objects. */
  strongCount: number
  /** Summed guard value (built-in plus outside) of the priced objects. */
  guardValue: number
  /** Player rows only: total value is more than 10% off the players' median. */
  flagged: boolean
}

export interface ZoneEconomy {
  players: ZoneEconomyRow[]
  neutral: ZoneEconomyRow[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export const zoneTotalValue = (r: ZoneEconomyRow): number => r.guardedValue + r.unguardedValue

export function computeZoneEconomy(context: MapContext, catalog: GameCatalog): ZoneEconomy | null {
  const { customAreasPainting, placedObjects } = context
  if (customAreasPainting.length === 0) return null

  const incomeBySid = new Map<string, { res: string; perDay: number }>()
  for (const logic of catalog.objectLogics ?? []) {
    if (logic.sourcePath !== 'res_mines') continue
    const { resName, resValue } = logic.raw as { resName?: string; resValue?: number }
    if (resName && typeof resValue === 'number') incomeBySid.set(logic.id, { res: resName, perDay: resValue })
  }

  const rows = new Map<number, ZoneEconomyRow>()
  const rowOf = (node: number): ZoneEconomyRow | undefined => {
    const zoneId = customAreasPainting[node] ?? 0
    if (zoneId === 0) return undefined
    let row = rows.get(zoneId)
    if (!row) {
      row = { zoneId, income: {}, guardedValue: 0, unguardedValue: 0, strongCount: 0, guardValue: 0, flagged: false }
      rows.set(zoneId, row)
    }
    return row
  }

  for (const o of placedObjects) {
    const mine = o.type === 0 ? incomeBySid.get(o.sid) : undefined
    const row = mine ? rowOf(o.node) : undefined
    if (mine && row) row.income[mine.res] = (row.income[mine.res] ?? 0) + mine.perDay
  }
  for (const r of guardRewardRows(context, catalog)) {
    const row = rowOf(r.object.node)
    if (!row) continue
    if (r.guardValue > 0) row.guardedValue += r.rewardValue
    else row.unguardedValue += r.rewardValue
    row.guardValue += r.guardValue
    if (r.tier === 'strong' || r.tier === 'veryStrong') row.strongCount += 1
  }

  const startsByZone = groupPlayerStartsByZone(context)
  const players: ZoneEconomyRow[] = []
  const neutral: ZoneEconomyRow[] = []
  for (const row of rows.values()) {
    const start = startsByZone.get(row.zoneId)?.[0]
    if (start) players.push({ ...row, owner: start.spawnerInfo?.owner ?? row.zoneId })
    else neutral.push(row)
  }
  // Areas that hold a start but no counted object still belong in the player table.
  for (const [zoneId, starts] of startsByZone) {
    if (zoneId !== 0 && !rows.has(zoneId)) players.push({ zoneId, owner: starts[0].spawnerInfo?.owner ?? zoneId, income: {}, guardedValue: 0, unguardedValue: 0, strongCount: 0, guardValue: 0, flagged: false })
  }
  players.sort((a, b) => (a.owner ?? 0) - (b.owner ?? 0))
  neutral.sort((a, b) => zoneTotalValue(b) - zoneTotalValue(a))

  if (players.length >= 2) {
    const med = median(players.map(zoneTotalValue))
    for (const p of players) p.flagged = med === 0 ? zoneTotalValue(p) !== 0 : Math.abs(zoneTotalValue(p) - med) / med > 0.1
  }
  return { players, neutral }
}
