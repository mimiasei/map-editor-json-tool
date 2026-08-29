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

/** A placed H3 Hero object (oid 34) — used to give a townless playable
 *  owner a `hero-spawner` start instead of leaving them with no start at
 *  all. Mirrors `CityCandidate`'s shape; heroes have no `mainTown`-style
 *  position hint to disambiguate multiple, so the lowest-index one wins
 *  (same deterministic tie-break convention as everywhere else in this
 *  module). */
export interface HeroCandidate {
  index: number
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
  /** Final compact owner per hero candidate index — only set for the one
   *  hero (if any) chosen to back a townless owner's `hero-spawner`; every
   *  other placed hero is unbound here (its real identity/army is still a
   *  documented gap — see convert-h3m-to-map.ts). */
  finalOwnerByHeroIndex: Map<number, number>
  /** 1..N compact owners in order; index 0 is always the human. */
  finalOwners: number[]
  humanFinalOwner: number
  /** 0 = human-capable (matches OE's `spawnType` convention), 1 = AI-only. */
  spawnTypeByFinalOwner: Map<number, number>
  /** Playable H3 players that own no city, no hero, and no neutral city was
   *  left to bind them to — a real, reportable gap (that player simply has
   *  no start this round), not a crash. */
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
 *
 * Priority per playable owner, matching real H3 semantics (a "hero starts
 * without a town" player is a genuine, common H3 setup, not an edge case):
 * 1. Owns a town -> bound to it (their `city-spawner`, see
 *    convert-h3m-to-map.ts).
 * 2. Owns no town but has >=1 placed Hero object -> bound to the lowest-
 *    index one (their `hero-spawner`) instead of inventing a town they
 *    never had.
 * 3. Neither -> the pre-existing orphan fallback: claim a spare unclaimed
 *    neutral town if one exists, else `unboundOrphanOwners` (no start).
 */
export function assignOwnership(header: H3mScenarioHeader, cities: CityCandidate[], heroes: HeroCandidate[]): OwnershipResult {
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

  const heroesByOwner = new Map<number, HeroCandidate[]>()
  for (const hero of heroes) {
    if (hero.h3Owner === null) continue
    const provisional = hero.h3Owner + 1
    const list = heroesByOwner.get(provisional)
    if (list) list.push(hero)
    else heroesByOwner.set(provisional, [hero])
  }

  const unboundOrphanOwners: number[] = []
  const claimedCityByOwner = new Map<number, CityCandidate>()
  const claimedHeroByOwner = new Map<number, HeroCandidate>()
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
      claimedCityByOwner.set(provisional, chosen)
      continue
    }
    const ownedHeroes = heroesByOwner.get(provisional) ?? []
    if (ownedHeroes.length > 0) {
      claimedHeroByOwner.set(provisional, [...ownedHeroes].sort((a, b) => a.index - b.index)[0])
      continue
    }
    // Orphan: claim the lowest-index unclaimed neutral city, if any remain.
    const next = neutralCities.shift()
    if (next) claimedCityByOwner.set(provisional, next)
    else unboundOrphanOwners.push(provisional)
  }

  // Compact renumber: human first, then every other provisional owner that
  // actually got a city or hero start, in ascending provisional order.
  const finalOwners: number[] = [humanProvisionalOwner]
  for (const provisional of [...provisionalOwners].sort((a, b) => a - b)) {
    if (provisional === humanProvisionalOwner) continue
    if (claimedCityByOwner.has(provisional) || claimedHeroByOwner.has(provisional)) finalOwners.push(provisional)
  }

  const finalByProvisional = new Map<number, number>()
  finalOwners.forEach((provisional, i) => finalByProvisional.set(provisional, i + 1))

  const finalOwnerByCityIndex = new Map<number, number>()
  for (const [provisional, city] of claimedCityByOwner) {
    const final = finalByProvisional.get(provisional)
    if (final !== undefined) finalOwnerByCityIndex.set(city.index, final)
  }
  const finalOwnerByHeroIndex = new Map<number, number>()
  for (const [provisional, hero] of claimedHeroByOwner) {
    const final = finalByProvisional.get(provisional)
    if (final !== undefined) finalOwnerByHeroIndex.set(hero.index, final)
  }

  const spawnTypeByFinalOwner = new Map<number, number>()
  for (const [provisional, final] of finalByProvisional) {
    const player = playable.find((p) => p.index + 1 === provisional)
    spawnTypeByFinalOwner.set(final, player?.canHuman ? 0 : 1)
  }

  return {
    finalOwnerByCityIndex,
    finalOwnerByHeroIndex,
    finalOwners: finalOwners.map((_, i) => i + 1),
    humanFinalOwner: 1,
    spawnTypeByFinalOwner,
    unboundOrphanOwners: unboundOrphanOwners.filter((o) => o !== humanProvisionalOwner || finalByProvisional.has(o) === false),
  }
}
