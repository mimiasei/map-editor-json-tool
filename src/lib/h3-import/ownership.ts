// ─── Player-seat ownership: compact renumbering + orphan-town binding ───────
// Simplified port of the reference project's `ownership_contract.py`
// (leviritchie/homm3-olden-stock-translator), used with the author's
// explicit permission. Ported concept, not verbatim code — see the doc
// comment on `assignOwnership` for exactly what's simplified out this round.
//
// Why this matters (confirmed by the reference project's own hard-won
// debugging, and independently consistent with real Olden maps): OE requires
// COMPACT owner numbering `1..N` with the human always at owner 1 — never a
// raw copy of H3's 0-based, often-sparse player-color byte. Getting this
// wrong doesn't just look odd — a naive "H3 color + 1" mapping breaks any
// map where the human isn't H3's first color.

import type { H3mScenarioHeader } from './h3m-format'

export interface CityCandidate {
  /** Index into the caller's own city array — the identity ownership
   *  resolution reports back against; the caller maps this to a real OE
   *  object id however it likes. */
  index: number
  /** H3 owner byte already normalized: 0-7, or `null` for neutral (255). */
  h3Owner: number | null
  sourceX: number
  sourceY: number
  sourceZ: number
}

export interface OwnershipResult {
  /** Final compact owner (1..N) per city candidate index, or `null` if the
   *  city stays neutral (never owned, or an orphan that couldn't be bound —
   *  see `unboundOrphanOwners`). */
  finalOwnerByCityIndex: Map<number, number>
  /** 1..N compact owners in order; index 0 is always the human. */
  finalOwners: number[]
  humanFinalOwner: number
  /** 0 = human-capable (matches OE's `spawnType` convention), 1 = AI-only. */
  spawnTypeByFinalOwner: Map<number, number>
  /** Playable H3 players that own no city and no neutral city was left to
   *  bind them to — a real, reportable gap (that player simply has no
   *  start this round), not a crash. */
  unboundOrphanOwners: number[]
}

/**
 * Simplified vs. the reference implementation:
 * - No AI multi-faction city-owner split (an AI player who owns towns of
 *   more than one faction keeps them all under one owner here, rather than
 *   being split into synthetic per-faction owners).
 * - Orphan-town binding picks the lowest-index unclaimed neutral city
 *   (deterministic, but not the reference's nearest-by-distance metric).
 * - `mainTown` position matching (H3 stores a town's entrance 2 cells left
 *   of its own placement anchor) is still ported, since it's cheap and
 *   meaningfully more correct when an owner has multiple towns.
 */
export function assignOwnership(header: H3mScenarioHeader, cities: CityCandidate[]): OwnershipResult {
  const playable = header.players.filter((p) => p.playable)
  const provisionalOwners = playable.map((p) => p.index + 1)
  const humanOwners = playable.filter((p) => p.canHuman).map((p) => p.index + 1).sort((a, b) => a - b)
  if (humanOwners.length === 0) throw new Error('Scenario has no human-capable playable player')
  const humanProvisionalOwner = humanOwners[0]

  const citiesByOwner = new Map<number, CityCandidate[]>()
  const neutralCities: CityCandidate[] = []
  for (const city of cities) {
    if (city.h3Owner === null) { neutralCities.push(city); continue }
    const provisional = city.h3Owner + 1
    const list = citiesByOwner.get(provisional)
    if (list) list.push(city)
    else citiesByOwner.set(provisional, [city])
  }
  neutralCities.sort((a, b) => a.index - b.index)

  const unboundOrphanOwners: number[] = []
  const claimedByOwner = new Map<number, CityCandidate>()
  for (const provisional of provisionalOwners) {
    const owned = citiesByOwner.get(provisional) ?? []
    if (owned.length > 0) {
      const player = playable.find((p) => p.index + 1 === provisional)
      const mainTown = player?.mainTown
      let chosen = owned[0]
      if (owned.length > 1) {
        if (mainTown) {
          // H3 stores a town's entrance 2 cells left of its own binary anchor.
          const expectedX = mainTown.x + 2
          const matches = owned.filter((c) => c.sourceX === expectedX && c.sourceY === mainTown.y && c.sourceZ === mainTown.z)
          chosen = matches.length === 1 ? matches[0] : [...owned].sort((a, b) => a.index - b.index)[0]
        } else {
          chosen = [...owned].sort((a, b) => a.index - b.index)[0]
        }
      }
      claimedByOwner.set(provisional, chosen)
      continue
    }
    // Orphan: claim the lowest-index unclaimed neutral city, if any remain.
    const next = neutralCities.shift()
    if (next) claimedByOwner.set(provisional, next)
    else unboundOrphanOwners.push(provisional)
  }

  // Compact renumber: human first, then every other provisional owner that
  // actually got a city, in ascending provisional order.
  const finalOwners: number[] = [humanProvisionalOwner]
  for (const provisional of [...provisionalOwners].sort((a, b) => a - b)) {
    if (provisional === humanProvisionalOwner) continue
    if (claimedByOwner.has(provisional)) finalOwners.push(provisional)
  }

  const finalByProvisional = new Map<number, number>()
  finalOwners.forEach((provisional, i) => finalByProvisional.set(provisional, i + 1))

  const finalOwnerByCityIndex = new Map<number, number>()
  for (const [provisional, city] of claimedByOwner) {
    const final = finalByProvisional.get(provisional)
    if (final !== undefined) finalOwnerByCityIndex.set(city.index, final)
  }

  const spawnTypeByFinalOwner = new Map<number, number>()
  for (const [provisional, final] of finalByProvisional) {
    const player = playable.find((p) => p.index + 1 === provisional)
    spawnTypeByFinalOwner.set(final, player?.canHuman ? 0 : 1)
  }

  return {
    finalOwnerByCityIndex,
    finalOwners: finalOwners.map((_, i) => i + 1),
    humanFinalOwner: 1,
    spawnTypeByFinalOwner,
    unboundOrphanOwners: unboundOrphanOwners.filter((o) => o !== humanProvisionalOwner || finalByProvisional.has(o) === false),
  }
}
