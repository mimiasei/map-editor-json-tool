// ─── Map Grid — decoration evenness between players ──────────────────────────
// Only for the Fairness dialog, to show the person making the map where one player's area is much more (or less) crowded with decorations
// (mountains, trees, rocks) than the others. Deliberately NOT part of computePlayerBalance's score: the random map generator picks its
// layouts with that score, and this must not change what it does.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { objectBlockedCells } from './passability'
import { groupOf } from './tile-index'
import { groupPlayerStartsByZone } from './zone-ownership'
import i18n from '@/lib/i18n'

export interface DecorationBalanceRow {
  owner: number
  zoneId: number
  decorationCount: number
  /** Dry tiles in the area that a decoration blocks. */
  blockedTiles: number
  /** Share (0-100) of the area's dry tiles that decorations block. */
  blockedPct: number
  flagged: boolean
}

export interface DecorationBalance {
  rows: DecorationBalanceRow[]
  /** One suggestion per flagged player. */
  notes: string[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Same players as computePlayerBalance (one start per Player Area); null when there are fewer than two. */
export function computeDecorationBalance(context: MapContext, catalog: GameCatalog | null): DecorationBalance | null {
  const { sizeX, sizeZ, customAreasPainting, waterMap, placedObjects } = context
  if (sizeX <= 0 || customAreasPainting.length === 0) return null
  const players: { zoneId: number; start: PlacedObject }[] = []
  for (const [zoneId, starts] of groupPlayerStartsByZone(context)) {
    if (zoneId !== 0) players.push({ zoneId, start: starts.find((s) => s.spawnerInfo) ?? starts[0] })
  }
  if (players.length < 2) return null

  const zoneAt = (x: number, z: number): number => (x < 0 || z < 0 || x >= sizeX || z >= sizeZ ? 0 : customAreasPainting[z * sizeX + x] ?? 0)
  const wanted = new Set(players.map((p) => p.zoneId))
  const land = new Map<number, number>()
  for (let node = 0; node < customAreasPainting.length; node++) {
    const zoneId = customAreasPainting[node]
    if (wanted.has(zoneId) && (waterMap[node] ?? 0) === 0) land.set(zoneId, (land.get(zoneId) ?? 0) + 1)
  }
  const count = new Map<number, number>()
  const blocked = new Map<number, Set<number>>()
  for (const o of placedObjects) {
    if (o.type !== 0 || groupOf(o, catalog) !== 'decorations') continue
    const zoneId = zoneAt(o.x, o.z)
    if (!wanted.has(zoneId)) continue
    count.set(zoneId, (count.get(zoneId) ?? 0) + 1)
    const cells = blocked.get(zoneId) ?? new Set<number>()
    for (const c of objectBlockedCells(o.sid, o.x, o.z, catalog, false, o.rotation)) {
      if (zoneAt(c.x, c.z) === zoneId && (waterMap[c.z * sizeX + c.x] ?? 0) === 0) cells.add(c.z * sizeX + c.x)
    }
    blocked.set(zoneId, cells)
  }

  const rows: DecorationBalanceRow[] = players.map(({ zoneId, start }) => {
    const blockedTiles = blocked.get(zoneId)?.size ?? 0
    const landTiles = land.get(zoneId) ?? 0
    return {
      owner: start.spawnerInfo?.owner ?? zoneId,
      zoneId,
      decorationCount: count.get(zoneId) ?? 0,
      blockedTiles,
      blockedPct: landTiles > 0 ? (blockedTiles / landTiles) * 100 : 0,
      flagged: false,
    }
  }).sort((a, b) => a.owner - b.owner)

  // Flagged when a player's blocked share is both 25% off the typical one and at least 2 points away, so tiny shares don't trip it.
  const typical = median(rows.map((r) => r.blockedPct))
  const notes: string[] = []
  for (const r of rows) {
    const gap = r.blockedPct - typical
    if (Math.abs(gap) < 2 || Math.abs(gap) < typical * 0.25) continue
    r.flagged = true
    notes.push(gap > 0
      ? i18n.t('validate.decorationBalance.tooBlocked', { owner: r.owner, pct: Math.round(r.blockedPct), typical: Math.round(typical) })
      : i18n.t('validate.decorationBalance.tooOpen', { owner: r.owner, pct: Math.round(r.blockedPct), typical: Math.round(typical) }))
  }
  return { rows, notes }
}
