// ─── RMG dedicated interactable scatter (issue #237 part 1/2) ───────────────
// `interactableDensity` used to do nothing at all — the only way an
// interactable (shrine/obelisk/dwelling-adjacent utility building/etc.) ever
// appeared was as a side effect of `treasureDensity`'s own neutral-zone-only
// budget (`zone-population.ts`'s `placeTreasure`, via `object-variety.ts`'s
// `objectVariety` split: 25% of each treasure slot). Per direct user
// clarification: the slider is meant to be a real, DIRECT roll-chance
// control over how many interactables get scattered across the map — not a
// second knob layered onto `treasureDensity`'s own budget. This pass is that
// control, structured exactly like `scatterZoneObstacles`
// (zone-decoration.ts) — a flat per-tile density roll, then `tryPlaceAt` for
// real footprint/collision checking — deliberately without that file's
// fuzzy-distance/biome/co-occurrence machinery: `pickInteractableSid`'s own
// three tiers have zero `biome` field in `Core/DB/map/objects/4_interactables.json`
// (confirmed: all 316 entries), so there's no biome context to bucket by.
// `placeTreasure`'s own interactable-via-treasure-budget path is untouched —
// the two are independent, deliberately non-overlapping sources (a treasure-
// economy-tied bonus vs. this file's own flat decorative scatter), not a
// double-counted duplicate of the same mechanic.

import type { CatalogMapObject } from '@/lib/catalog/types'
import type { ZoneSpec } from './zone-graph'
import { isRmgIneligibleInteractableSid, pickInteractableSid } from './object-variety'
import { tryPlaceAt, type PlacementState, type ZonePlacement } from './zone-population'

export interface ScatterInteractablesOptions {
  sizeX: number
  sizeZ: number
  zones: ZoneSpec[]
  tilesByZone: Map<number, number[]>
  catalogById: Map<string, CatalogMapObject>
  /** Road/river/water tiles, same exclusion `scatterZoneObstacles` applies —
   *  an interactable never covers either. */
  excludedNodes: Set<number>
  state: PlacementState
  rng: () => number
  /** Per-tile roll chance in a neutral zone (0-1). A player zone gets 0.4x
   *  this, the same "still some, not crowding a buildable start" dampening
   *  `scatterZoneObstacles` applies at 0.6x — lower here since an
   *  interactable is a bigger, more attention-grabbing footprint than a
   *  tree/rock. Defaults to 0.25 (matches `object-variety.ts`'s own
   *  treasure-budget interactable share for continuity, not a hard rule). */
  density?: number
  /** Real, placeable interactable sids the RMG is NOT allowed to pick —
   *  issue #238's own interactable browser/selector dialog, same disabled
   *  set `zone-population.ts`'s content-pool roll respects. Composed into
   *  the cap-check `pickInteractableSid` already takes, so a disabled sid
   *  just falls through to another tier/sid rather than being placed.
   *  Empty/omitted (the default) is today's exact behavior. */
  disabledInteractableSids?: Set<string>
  /** Built-in ring layout (issue #255): instead of a per-tile coin flip (whose
   *  count varies by chance from player to player), every zone of the same kind
   *  gets the same fixed number of interactables — the kind's mean tile count
   *  times the density — at random free tiles. */
  symmetricZones?: boolean
}

export function scatterZoneInteractables(options: ScatterInteractablesOptions): ZonePlacement[] {
  const { sizeX, sizeZ, zones, tilesByZone, catalogById, excludedNodes, state, rng, density = 0.25, disabledInteractableSids, symmetricZones = false } = options
  const placements: ZonePlacement[] = []
  const isDisabled = (candidate: string): boolean => isRmgIneligibleInteractableSid(candidate) || (disabledInteractableSids?.has(candidate) ?? false)
  if (symmetricZones) {
    const meanTiles = (kind: 'player' | 'neutral'): number => {
      const counts = zones.filter((z) => z.kind === kind).map((z) => tilesByZone.get(z.id)?.length ?? 0)
      return counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0
    }
    const target = { player: Math.round(meanTiles('player') * density * 0.4), neutral: Math.round(meanTiles('neutral') * density) }
    for (const zone of zones) {
      const free = (tilesByZone.get(zone.id) ?? []).filter((n) => !excludedNodes.has(n))
      if (free.length === 0) continue
      // One attempt per roll (not retried until it fits): the per-tile roll this
      // replaces also lost rolls to collisions, and retrying would raise the
      // map's interactable density well above what the slider has always meant.
      for (let roll = 0; roll < target[zone.kind]; roll++) {
        const node = free[Math.floor(rng() * free.length)]
        const sid = pickInteractableSid(rng, isDisabled)
        if (!sid) continue
        if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) placements.push({ tempId: state.nextTempId++, sid, node })
      }
    }
    return placements
  }
  for (const zone of zones) {
    const tiles = tilesByZone.get(zone.id) ?? []
    if (tiles.length === 0) continue
    const zoneDensity = zone.kind === 'player' ? density * 0.4 : density
    for (const node of tiles) {
      if (excludedNodes.has(node)) continue
      if (rng() >= zoneDensity) continue
      const sid = pickInteractableSid(rng, isDisabled)
      if (!sid) continue
      if (tryPlaceAt(sid, node, sizeX, sizeZ, catalogById, state)) {
        placements.push({ tempId: state.nextTempId++, sid, node })
      }
    }
  }
  return placements
}
