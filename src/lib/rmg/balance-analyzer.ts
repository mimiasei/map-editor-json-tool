// ─── RMG balance scorer (issue #210) ─────────────────────────────────────────
// Ported from a real, working heuristic model — `olden-era-rmg-editor`'s own
// `balanceAnalyzer.ts` (github.com/GendizerGaming/olden-era-rmg-editor), a
// third-party editor for this same game's RMG templates. Not invented here:
// the weights/penalties below are that project's own tuned values, kept
// verbatim rather than re-derived from scratch.
//
// Advisory only, same as the original: correctness (disconnected graphs,
// missing spawns) is somebody else's job — this only judges SYMMETRY once a
// map is already known to be structurally valid (which TSE's own zone graph
// always is by construction — `buildZoneGraph`'s ring is connected, and
// Stage 1 template import is expected to only ever come from real,
// presumably-valid game templates).
//
// A real, disclosed limitation: "zone wealth" here is a proxy, not the
// reference's own `guardedValue+unguardedValue+resourcesValue` (TSE's
// `ZonePlacement` doesn't carry a stored treasure "cost" the way the
// reference format's zones do) — it sums each zone's own real guard/treasure
// `requestedValue`s (`randomSquadOverrides`) plus a rarity-implied value for
// `random-item` placements (the same cost scale `zone-population.ts`'s own
// `RARITY_TABLE` already uses, duplicated here as a small local constant
// rather than exporting a private const across modules for one array).
// Concrete squads/pre-composed armies have no stored value field at all in
// this codebase yet, so they don't contribute to wealth — a known, disclosed
// gap, not a silent omission.

import type { ZoneGraph } from './zone-graph'
import { zoneDistanceMatrix } from './zone-graph'
import type { ZonePlacement } from './zone-population'

export type BalanceSeverity = 'ok' | 'warn' | 'bad'
export interface BalanceFinding {
  severity: BalanceSeverity
  message: string
}

export interface BalanceReport {
  /** 0-100; null when the map has no player zones to judge (shouldn't
   *  happen for a real generation, but a template-imported graph could
   *  theoretically have none). */
  score: number | null
  findings: BalanceFinding[]
  summary: {
    zones: number
    players: number
    totalWealth: number
    wealthPerPlayer: number
    /** Relative spread (max-min)/max of each player's own distance-damped
     *  accessible wealth, 0-1. */
    wealthSpread: number
  }
}

/** Same cost scale `zone-population.ts`'s own `RARITY_TABLE` uses for
 *  `random-item.rarity` (0-3) — kept as a small local duplicate here rather
 *  than exporting that file's private const for one array's sake. */
const RARITY_VALUE = [1, 2, 4, 10]

function spread(values: number[]): number {
  if (values.length < 2) return 0
  const max = Math.max(...values)
  const min = Math.min(...values)
  return max > 0 ? (max - min) / max : 0
}

/** Sums every real placement's own value into its own zone — the "wealth"
 *  this analysis compares for symmetry. `zoneIdByNode` resolves each
 *  placement's node to a zone id (same array every other RMG stage uses). */
export function computeZoneWealth(placements: ZonePlacement[], zoneIdByNode: number[]): Map<number, number> {
  const wealthByZone = new Map<number, number>()
  const add = (zoneId: number, value: number) => {
    if (value <= 0) return
    wealthByZone.set(zoneId, (wealthByZone.get(zoneId) ?? 0) + value)
  }
  for (const p of placements) {
    const zoneId = zoneIdByNode[p.node]
    if (zoneId === undefined) continue
    if (p.randomSquadOverrides) add(zoneId, p.randomSquadOverrides.requestedValue)
    if (p.randomItemOverrides) add(zoneId, RARITY_VALUE[p.randomItemOverrides.rarity] ?? 0)
  }
  return wealthByZone
}

/** Every chokepoint guard's own value, grouped by the zone it defends the
 *  entrance TO (`zone-boundary.ts`'s own `crossing.enteringZone`) — used
 *  below as each player's own "cheapest way out" figure (the nearest
 *  neighbor zone's own entrance guard, from the player's side). */
export function computeExitGuardsByZone(
  guardPlacements: { node: number; randomSquadOverrides?: { requestedValue: number } }[],
  zoneIdByNode: number[],
): Map<number, number[]> {
  const byZone = new Map<number, number[]>()
  for (const g of guardPlacements) {
    const zoneId = zoneIdByNode[g.node]
    if (zoneId === undefined || !g.randomSquadOverrides) continue
    const list = byZone.get(zoneId)
    if (list) list.push(g.randomSquadOverrides.requestedValue)
    else byZone.set(zoneId, [g.randomSquadOverrides.requestedValue])
  }
  return byZone
}

/**
 * Balance analysis of a generated zone graph. Everything here is heuristic
 * and advisory: the score starts at 100 and loses points for player
 * asymmetry (wealth, distances, exit guards) and a couple of structural
 * smells — never a hard pass/fail.
 */
export function analyzeBalance(
  graph: ZoneGraph,
  zoneWealth: Map<number, number>,
  exitGuardsByZone: Map<number, number[]>,
): BalanceReport {
  const dist = zoneDistanceMatrix(graph)
  const players = graph.zones.filter((z) => z.kind === 'player')
  const totalWealth = [...zoneWealth.values()].reduce((sum, v) => sum + v, 0)

  if (players.length === 0) {
    return {
      score: null,
      findings: [{ severity: 'warn', message: 'No player zones to judge.' }],
      summary: { zones: graph.zones.length, players: 0, totalWealth, wealthPerPlayer: 0, wealthSpread: 0 },
    }
  }

  const findings: BalanceFinding[] = []
  let score = 100

  const perPlayer = players.map((player) => {
    let gravity = 0
    for (const zone of graph.zones) {
      const d = dist[player.id][zone.id]
      if (!Number.isFinite(d)) continue
      gravity += (zoneWealth.get(zone.id) ?? 0) / (1 + d)
    }
    const othersDistances = players
      .filter((other) => other !== player)
      .map((other) => dist[player.id][other.id])
      .filter((d) => Number.isFinite(d))
    // Adjacent zones' own entrance guards — the cheapest of them is this
    // player's own "nearest way out" figure.
    const neighborZoneIds = graph.edges
      .filter(([a, b]) => a === player.id || b === player.id)
      .map(([a, b]) => (a === player.id ? b : a))
    const exitGuards = neighborZoneIds.flatMap((zoneId) => exitGuardsByZone.get(zoneId) ?? [])
    return {
      player,
      gravity,
      averageOpponentDistance: othersDistances.length ? othersDistances.reduce((sum, d) => sum + d, 0) / othersDistances.length : 0,
      minExitGuard: exitGuards.length ? Math.min(...exitGuards) : 0,
      exitCount: neighborZoneIds.length,
    }
  })

  const wealthSpread = spread(perPlayer.map((p) => p.gravity))

  if (players.length > 1) {
    score -= Math.min(45, Math.round(wealthSpread * 180))
    if (wealthSpread > 0.25) {
      const poorest = perPlayer.reduce((a, b) => (a.gravity < b.gravity ? a : b))
      findings.push({ severity: 'bad', message: `Wealth spread ${Math.round(wealthSpread * 100)}% — player ${poorest.player.playerIndex} has meaningfully less accessible wealth than the others.` })
    } else if (wealthSpread > 0.1) {
      findings.push({ severity: 'warn', message: `Wealth spread ${Math.round(wealthSpread * 100)}% — noticeable but not severe.` })
    } else {
      findings.push({ severity: 'ok', message: `Wealth spread ${Math.round(wealthSpread * 100)}% — players have comparable accessible wealth.` })
    }

    const distanceSpread = spread(perPlayer.map((p) => p.averageOpponentDistance))
    score -= Math.min(25, Math.round(distanceSpread * 100))
    if (distanceSpread > 0.25) {
      findings.push({ severity: 'bad', message: `Distance spread ${Math.round(distanceSpread * 100)}% — some players are much closer to the action than others.` })
    } else if (distanceSpread > 0.1) {
      findings.push({ severity: 'warn', message: `Distance spread ${Math.round(distanceSpread * 100)}%.` })
    } else {
      findings.push({ severity: 'ok', message: 'Players are roughly equidistant from each other.' })
    }

    const guardSpread = spread(perPlayer.map((p) => p.minExitGuard))
    score -= Math.min(15, Math.round(guardSpread * 50))
    if (guardSpread > 0.3) {
      findings.push({ severity: 'warn', message: `Exit-guard spread ${Math.round(guardSpread * 100)}% — some players have a much cheaper way out than others.` })
    }

    const pairDistances: number[] = []
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        pairDistances.push(dist[players[i].id][players[j].id])
      }
    }
    const minPair = pairDistances.length ? Math.min(...pairDistances) : 0
    if (minPair === 1) {
      score -= 10
      findings.push({ severity: 'warn', message: 'Two players spawn directly adjacent to each other (an early-rush risk).' })
    }
  }

  for (const p of perPlayer) {
    if (p.exitCount === 1) {
      findings.push({ severity: 'warn', message: `Player ${p.player.playerIndex} has only a single way out of their zone.` })
    }
  }

  score = Math.max(0, Math.min(100, score))
  if (findings.every((f) => f.severity === 'ok')) {
    findings.push({ severity: 'ok', message: 'No balance concerns found.' })
  }

  return {
    score,
    findings,
    summary: {
      zones: graph.zones.length,
      players: players.length,
      totalWealth,
      wealthPerPlayer: Math.round(totalWealth / players.length),
      wealthSpread,
    },
  }
}
