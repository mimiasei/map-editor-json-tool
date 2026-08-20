// ─── Map grid — elevation tint ───────────────────────────────────────────────
// Originally a "bevel" effect (a soft highlight/shadow along the boundary of
// an elevation change only) — replaced per user feedback with a simpler, flat
// tint over every tile at a non-ground level: darker at level -1 (lowered),
// lighter at level 1 (heightened), regardless of whether that specific tile
// sits on a wall or deep interior. levelsMap is the only input needed; no
// neighbor scan, no climbsMap ramp exception.

export type ElevationTint = 'darker' | 'lighter'

/** Per-node tint for every tile at a non-ground (`levelsMap` ±1) level. */
export function buildElevationTintMap(levelsMap: number[]): Map<number, ElevationTint> {
  const tints = new Map<number, ElevationTint>()
  for (let node = 0; node < levelsMap.length; node++) {
    const level = levelsMap[node]
    if (level === 1) tints.set(node, 'lighter')
    else if (level === -1) tints.set(node, 'darker')
  }
  return tints
}
