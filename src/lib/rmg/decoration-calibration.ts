// ─── Real-data decoration calibration (issue #224, "Problem 2: Aesthetic
// detailing") ─────────────────────────────────────────────────────────────
// Two real statistics measured directly against all 12 real hand-crafted OE
// maps via scripts/calibrate-decoration-density.ts (road tiles from each
// map's own roadsMap, decoration instances classified into obstacles/
// clutter/mountains/pools exactly as fuzzy-obstacle.ts's own
// buildFuzzyObstaclePools already does) — never fabricated, both numbers
// below are exactly what that script printed.
//
// 1. Density vs. distance-to-nearest-road-tile (9 of 12 maps have roads at
//    all; pooled across all of them, ~58,480 real decoration instances):
//    tiles within 0-2 of a road are REAL-MEASURED at 0.78x the map's own
//    overall decoration density (a "keep the roadside clear" pattern real
//    maps actually show), rising to 1.29x by 21+ tiles out. Confirms the
//    research plan's own "thinning decoration near paths, thickening in
//    unused pockets" hypothesis (plans/rmg-ml-research-issue.md, Problem 2)
//    with a real curve instead of an assumed one.
// 2. Category co-occurrence (all 12 maps, every category pair, radius 3 —
//    zone-decoration.ts's own CLUSTER_RADIUS): observed rate of a B-category
//    instance within radius 3 of an A-category instance, divided by the
//    baseline rate expected from B's own overall per-tile density with no
//    spatial preference. Values near 1.0 mean "no real effect beyond
//    chance" (most pairs) — the two real, meaningful findings are
//    pools:pools = 1.60 (real ponds cluster with more pond pieces) and
//    mountains:pools = 0.57 (mountains and pools real-avoid each other).
//    Kept as measured rather than rounded toward "no effect" — a weak real
//    signal (e.g. clutter:mountains = 0.63) is still real evidence, not
//    noise to discard.

export type DecorationCategory = 'obstacles' | 'clutter' | 'mountains' | 'pools'
export const DECORATION_CATEGORIES: DecorationCategory[] = ['obstacles', 'clutter', 'mountains', 'pools']

interface RoadDistanceBucket {
  /** Inclusive upper bound of this bucket's distance range (tiles). */
  maxDist: number
  /** Real decoration density in this bucket, relative to the map's own
   *  overall average density (1.0 = average). */
  multiplier: number
}

const ROAD_DISTANCE_DENSITY_BUCKETS: RoadDistanceBucket[] = [
  { maxDist: 2, multiplier: 0.78 },
  { maxDist: 5, multiplier: 1.07 },
  { maxDist: 10, multiplier: 1.02 },
  { maxDist: 20, multiplier: 1.04 },
  { maxDist: Infinity, multiplier: 1.29 },
]

/** Real decoration-density multiplier at a given tile distance from the
 *  nearest road (relative to the map's own overall average, 1.0 = no
 *  change) — see this file's header comment for the real evidence. */
export function roadDistanceDensityMultiplier(distanceToRoad: number): number {
  for (const bucket of ROAD_DISTANCE_DENSITY_BUCKETS) {
    if (distanceToRoad <= bucket.maxDist) return bucket.multiplier
  }
  return ROAD_DISTANCE_DENSITY_BUCKETS[ROAD_DISTANCE_DENSITY_BUCKETS.length - 1].multiplier
}

/** `CO_OCCURRENCE_MULTIPLIER[A][B]` = real observed/baseline ratio of a
 *  B-category instance appearing within radius 3 of an A-category instance
 *  — see this file's header comment. Not symmetric (real conditional
 *  co-occurrence isn't symmetric; A's own local density differs from B's). */
export const CO_OCCURRENCE_MULTIPLIER: Record<DecorationCategory, Record<DecorationCategory, number>> = {
  obstacles: { obstacles: 1.00, clutter: 0.95, mountains: 0.70, pools: 0.78 },
  clutter: { obstacles: 0.99, clutter: 1.00, mountains: 0.63, pools: 0.78 },
  mountains: { obstacles: 0.94, clutter: 0.82, mountains: 1.02, pools: 0.57 },
  pools: { obstacles: 1.00, clutter: 0.96, mountains: 0.70, pools: 1.60 },
}

/** Blends a real calibrated multiplier toward 1.0 (no effect) by `strength`
 *  (0 = no effect regardless of real data, 1 = the full real multiplier) —
 *  the same "strength slider scales real evidence, never invents beyond it"
 *  shape used for `strength` params throughout this generator. */
export function scaleMultiplier(multiplier: number, strength: number): number {
  return 1 + strength * (multiplier - 1)
}

/** Real co-occurrence bias for placing a `target` category near a set of
 *  already-placed `nearbyCategories` (deduplicated by the caller) — the mean
 *  of `CO_OCCURRENCE_MULTIPLIER[nearby][target]` across every distinct
 *  category actually present nearby, or 1.0 (no bias) when nothing is
 *  nearby yet. Averaging (not max/min) avoids one large existing cluster
 *  dominating the bias when several different categories are all nearby. */
export function coOccurrenceBias(nearbyCategories: DecorationCategory[], target: DecorationCategory): number {
  if (nearbyCategories.length === 0) return 1
  const sum = nearbyCategories.reduce((acc, nearby) => acc + CO_OCCURRENCE_MULTIPLIER[nearby][target], 0)
  return sum / nearbyCategories.length
}
