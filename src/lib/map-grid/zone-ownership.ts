// ─── Player Areas — positional player↔zone inference ────────────────────────
// No persisted link field ties a "custom area" zone id to a player anywhere
// in the real .map format (confirmed against validationtest_gme.map) — a
// player's zone is inferred purely from which zone id its own start
// (city-spawner/hero-spawner) sits on, matching the one real GME sample
// surveyed (each city fully enclosed by its own painted region).

import type { MapContext, PlacedObject } from '@/types/map-context'

const PLAYER_START_SIDS = new Set(['city-spawner', 'hero-spawner'])

/** Every player-start placement grouped by the zone id its own node sits in.
 *  Zone id 0 (unzoned) is its own real bucket, not excluded — callers use it
 *  to find players who get the whole-map fallback check. Two players
 *  sharing one zone, or a zone with zero players ("orphan"), are both real
 *  possibilities this reports as-is, never assumed away. */
export function groupPlayerStartsByZone(
  context: Pick<MapContext, 'placedObjects' | 'customAreasPainting'>,
): Map<number, PlacedObject[]> {
  const byZone = new Map<number, PlacedObject[]>()
  const zones = context.customAreasPainting
  for (const item of context.placedObjects) {
    if (item.type !== 0 || !PLAYER_START_SIDS.has(item.sid)) continue
    const zoneId = zones[item.node] ?? 0
    const list = byZone.get(zoneId)
    if (list) list.push(item)
    else byZone.set(zoneId, [item])
  }
  return byZone
}
