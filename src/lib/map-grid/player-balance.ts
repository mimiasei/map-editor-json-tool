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
  /** Players or areas the comparison could not use (a start outside every Player Area, two starts in one area, an area with no start). They are
   *  left out of the table, so the score does not cover them. */
  problems: string[]
  /** What to change to even the players out, biggest gap first. Suggestions from the same numbers as the score, not game rules. */
  recommendations: string[]
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

  // Starts the table leaves out: say so instead of scoring a smaller game in silence.
  const problems: string[] = []
  const label = (s: PlacedObject) => `Player ${s.spawnerInfo?.owner ?? '?'} (${s.x}, ${s.z})`
  for (const s of startsByZone.get(0) ?? []) problems.push(`${label(s)} is not inside any Player Area, so it is not compared. Paint an area over its start tile.`)
  for (const [zoneId, starts] of startsByZone) {
    if (zoneId !== 0 && starts.length > 1) {
      problems.push(`${starts.map(label).join(' and ')} share Player Area ${zoneId}, so only one of them is compared. Give each start its own area.`)
    }
  }
  const startZones = new Set(startsByZone.keys())
  for (const id of new Set(customAreasPainting)) {
    if (id !== 0 && !startZones.has(id)) problems.push(`Player Area ${id} has no city or hero start inside it.`)
  }

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

  const recommendations = buildRecommendations(rows, medians)

  const verdict = score >= 90 ? 'Excellent' : score >= 78 ? 'Good' : score >= 60 ? 'Uneven' : 'Unfair'
  return { rows, score, verdict, reasons, problems, recommendations }
}

const MAX_RECOMMENDATIONS = 6

/** One suggestion per flagged player and dimension, worst gap first. `medians` are the typical player's values the flags were set against. */
function buildRecommendations(
  rows: PlayerBalanceRow[],
  medians: { land: number; mines: number; sites: number; terrain: number },
): string[] {
  const found: { gap: number; text: string }[] = []
  const pct = (value: number, med: number) => Math.round((Math.abs(value - med) / med) * 100)
  for (const r of rows) {
    const who = `Player ${r.owner}`
    if (r.flags.has('land') && medians.land > 0) {
      const less = r.landTiles < medians.land
      found.push({
        gap: Math.abs(r.landTiles - medians.land) / medians.land,
        text: less
          ? `${who} has ${pct(r.landTiles, medians.land)}% less land than the typical player (${r.landTiles} vs ${Math.round(medians.land)} tiles): paint more of the surrounding ground as their Player Area, or turn some of their water or blocked ground into land.`
          : `${who} has ${pct(r.landTiles, medians.land)}% more land than the typical player (${r.landTiles} vs ${Math.round(medians.land)} tiles): shrink their Player Area, or give the others more room.`,
      })
    }
    if (r.flags.has('mines') && medians.mines > 0) {
      const far = r.meanMineDistance > medians.mines
      found.push({
        gap: Math.abs(r.meanMineDistance - medians.mines) / medians.mines,
        text: far
          ? `${who}'s mines are on average ${r.meanMineDistance.toFixed(0)} tiles from their start, the typical player's ${medians.mines.toFixed(0)}: move one or two of their mines closer.`
          : `${who}'s mines are only ${r.meanMineDistance.toFixed(0)} tiles from their start, the typical player's ${medians.mines.toFixed(0)}: move one of their mines farther out, or bring the others' closer.`,
      })
    }
    if (r.flags.has('sites') && medians.sites > 0) {
      const fewer = r.siteCount < medians.sites
      found.push({
        gap: Math.abs(r.siteCount - medians.sites) / medians.sites,
        text: fewer
          ? `${who} has ${r.siteCount} sites to claim, the typical player ${Math.round(medians.sites)}: add a few mines, dwellings, resource piles or artifacts in their area.`
          : `${who} has ${r.siteCount} sites to claim, the typical player ${Math.round(medians.sites)}: remove a few from their area, or add some for the others.`,
      })
    }
    if (r.flags.has('terrain')) {
      const more = r.elevatedPct > medians.terrain
      found.push({
        gap: Math.abs(r.elevatedPct - medians.terrain) / 100,
        text: more
          ? `${who}'s area is ${Math.round(r.elevatedPct)}% hills or valleys against the typical player's ${Math.round(medians.terrain)}%: flatten some of it.`
          : `${who}'s area is only ${Math.round(r.elevatedPct)}% hills or valleys against the typical player's ${Math.round(medians.terrain)}%: raise or lower some ground to match the others.`,
      })
    }
  }
  found.sort((a, b) => b.gap - a.gap)
  return found.slice(0, MAX_RECOMMENDATIONS).map((f) => f.text)
}
