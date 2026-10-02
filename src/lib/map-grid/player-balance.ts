// ─── Map Grid — player balance report (issue #255) ──────────────────────────
// How fair is a map between its players? Computed purely from the loaded map
// (never from generator internals) so the same report works right after
// generation and later from the Stats panel, for generated and hand-made maps
// alike. Players are compared by their own painted "player area" zone
// (zone-ownership.ts) — the RMG paints one per player; a map without them has
// no way to say which land belongs to whom, so this returns null.
//
// Guard strength is deliberately NOT compared: a guard's value is a lumpy,
// heavy-tailed band roll (two equivalent guards can differ 40x), and gate
// guards on the zone border can't be told apart from a player's own guards,
// so a "guard" column was mostly noise.
//
// Deliberately only compares each player's OWN zone. It cannot see the
// neutral zones around them (the map doesn't record the zone graph), so a
// lopsided neighbour is not reflected here.

import type { MapContext, PlacedObject } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { factionDisplayName } from '@/lib/factions'
import { collectArtifactSids } from '@/lib/rmg/object-variety'
import { isGuardCandidate } from '@/lib/rmg/zone-guard-scatter'
import { groupPlayerStartsByZone } from './zone-ownership'

export type BalanceDimension = 'land' | 'mines' | 'terrain' | 'sites'

export interface PlayerBalanceRow {
  owner: number
  faction: string
  zoneId: number
  landTiles: number
  mineCount: number
  /** Mean straight-line tiles from the player's start to its own mines. */
  meanMineDistance: number
  /** Share (0-100) of the zone's dry tiles that are hill or valley. */
  elevatedPct: number
  /** Mines, dwellings, resources, interactables and artifacts in the zone. */
  siteCount: number
  /** Dimensions where this player is notably off the group's median. */
  flags: Set<BalanceDimension>
}

export interface PlayerBalance {
  rows: PlayerBalanceRow[]
  /** 0-100, 100 = identical players. */
  score: number
  verdict: 'Excellent' | 'Good' | 'Uneven' | 'Unfair'
  /** Plain-language reasons points were lost (empty when nothing notable). */
  reasons: string[]
}

/** (max - min) / max, 0 when there is nothing to compare. */
function spread(values: number[]): number {
  const max = Math.max(...values)
  const min = Math.min(...values)
  return max > 0 ? (max - min) / max : 0
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Relative distance from the median, except where the median is 0. */
function offMedian(value: number, med: number): boolean {
  if (med === 0) return value !== 0
  return Math.abs(value - med) / med > 0.1
}

export function computePlayerBalance(context: MapContext, catalog: GameCatalog | null): PlayerBalance | null {
  const { sizeX, customAreasPainting, levelsMap, waterMap, placedObjects } = context
  if (sizeX <= 0 || customAreasPainting.length === 0) return null

  const startsByZone = groupPlayerStartsByZone(context)
  const players: { zoneId: number; start: PlacedObject }[] = []
  for (const [zoneId, starts] of startsByZone) {
    if (zoneId === 0) continue
    const start = starts.find((s) => s.spawnerInfo) ?? starts[0]
    players.push({ zoneId, start })
  }
  if (players.length < 2) return null
  const zoneIds = new Set(players.map((p) => p.zoneId))

  const land = new Map<number, number>()
  const elevated = new Map<number, number>()
  for (let node = 0; node < customAreasPainting.length; node++) {
    const zoneId = customAreasPainting[node]
    if (!zoneIds.has(zoneId)) continue
    if ((waterMap[node] ?? 0) !== 0) continue
    land.set(zoneId, (land.get(zoneId) ?? 0) + 1)
    if ((levelsMap[node] ?? 0) !== 0) elevated.set(zoneId, (elevated.get(zoneId) ?? 0) + 1)
  }

  const artifactSids = new Set(catalog ? collectArtifactSids(catalog) : [])
  const rows: PlayerBalanceRow[] = players.map(({ zoneId, start }) => {
    const mines: PlacedObject[] = []
    let siteCount = 0
    for (const o of placedObjects) {
      if (o.type !== 0 || customAreasPainting[o.node] !== zoneId) continue
      if (o.sid.startsWith('mine_')) mines.push(o)
      if (o.sid !== 'random-squad' && isGuardCandidate(o.sid, artifactSids)) siteCount += 1
    }
    const meanMineDistance = mines.length > 0
      ? mines.reduce((sum, m) => sum + Math.hypot(m.x - start.x, m.z - start.z), 0) / mines.length
      : 0
    const landTiles = land.get(zoneId) ?? 0
    return {
      owner: start.spawnerInfo?.owner ?? zoneId,
      faction: start.spawnerInfo?.factionSid ? factionDisplayName(start.spawnerInfo.factionSid, catalog?.factions) : 'Random',
      zoneId,
      landTiles,
      mineCount: mines.length,
      meanMineDistance,
      elevatedPct: landTiles > 0 ? ((elevated.get(zoneId) ?? 0) / landTiles) * 100 : 0,
      siteCount,
      flags: new Set<BalanceDimension>(),
    }
  }).sort((a, b) => a.owner - b.owner)

  const medians = {
    land: median(rows.map((r) => r.landTiles)),
    mines: median(rows.map((r) => r.meanMineDistance)),
    sites: median(rows.map((r) => r.siteCount)),
    terrain: median(rows.map((r) => r.elevatedPct)),
  }
  for (const r of rows) {
    if (offMedian(r.landTiles, medians.land)) r.flags.add('land')
    if (offMedian(r.meanMineDistance, medians.mines)) r.flags.add('mines')
    if (offMedian(r.siteCount, medians.sites)) r.flags.add('sites')
    if (Math.abs(r.elevatedPct - medians.terrain) > 10) r.flags.add('terrain')
  }

  // Each dimension can cost up to its own cap; a 100% spread hits the cap.
  const landSpread = spread(rows.map((r) => r.landTiles))
  const mineSpread = spread(rows.map((r) => r.meanMineDistance))
  const siteSpread = spread(rows.map((r) => r.siteCount))
  const terrainRange = Math.max(...rows.map((r) => r.elevatedPct)) - Math.min(...rows.map((r) => r.elevatedPct))
  let score = 100
  const reasons: string[] = []
  const charge = (cost: number, cap: number, reason: string, threshold: number, amount: number): void => {
    score -= Math.min(cap, cost)
    if (amount > threshold) reasons.push(reason)
  }
  charge(landSpread * 100, 25, `Land differs by ${Math.round(landSpread * 100)}% between players`, 0.07, landSpread)
  charge(mineSpread * 60, 15, `Distance to the starting mines differs by ${Math.round(mineSpread * 100)}%`, 0.2, mineSpread)
  charge(siteSpread * 50, 25, `Number of sites to claim differs by ${Math.round(siteSpread * 100)}%`, 0.15, siteSpread)
  charge(terrainRange * 0.8, 15, `Hills/valleys around the starts differ by ${Math.round(terrainRange)} points`, 10, terrainRange)
  score = Math.max(0, Math.min(100, Math.round(score)))

  const verdict = score >= 90 ? 'Excellent' : score >= 78 ? 'Good' : score >= 60 ? 'Uneven' : 'Unfair'
  return { rows, score, verdict, reasons }
}
