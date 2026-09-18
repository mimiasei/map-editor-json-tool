// ─── Map grid — circular brush radius ─────────────────────────────────────────
// Pure geometry, no file I/O — issue #193 punch-list item ("shared brush size
// control (radius, not just single-tile) for Terrain/Level/Obstacles"),
// scoped in the original plan but never wired up in any phase.

// Deterministic per-tile pseudo-random value in [0, 1) — a simple integer
// hash-mix (not Math.random()), so a given absolute tile always makes the
// same keep/skip decision for `disperse` regardless of which brush stroke
// or which anchor position along a drag reached it. That matters because
// tilesInRadius is called fresh on every pointermove with a new center —
// with a non-deterministic thinning, dragging back and forth over the same
// area would keep re-rolling and eventually fill in every gap.
function hashUnit(x: number, z: number): number {
  let h = (x * 374761393 + z * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

/**
 * Every tile within `radius` tiles of `(centerX, centerZ)` (inclusive,
 * Euclidean distance — a circular brush, not a square one), clamped to the
 * map's own bounds. `radius === 1` (the default/minimum) returns exactly
 * the center tile alone, matching the single-tile behavior every brush had
 * before this control existed.
 *
 * `disperse` (0-1, default 0) thins the result: each non-center tile survives
 * only if its deterministic hash is >= disperse, so 0 keeps the full solid
 * area (unchanged from before this option existed) and values approaching 1
 * leave only a sparse scatter of tiles spread across the brush's area. The
 * exact center tile always survives, so a click/drag never becomes a
 * complete no-op purely because of where it happens to land on the map.
 * The incoming disperse value is multiplied by 0.95 so it never reaches a
 * higher value than that, thereby making sure even 100% disperse paints more
 * than one singular tile.
 */
export function tilesInRadius(
  centerX: number,
  centerZ: number,
  radius: number,
  sizeX: number,
  sizeZ: number,
  disperse: number = 0,
): number[] {
  const nodes: number[] = []
  const r = Math.max(1, radius)
  const rSquared = (r - 1 + 0.5) * (r - 1 + 0.5)
  const minX = Math.max(0, centerX - (r - 1))
  const maxX = Math.min(sizeX - 1, centerX + (r - 1))
  const minZ = Math.max(0, centerZ - (r - 1))
  const maxZ = Math.min(sizeZ - 1, centerZ + (r - 1))
  disperse *= 0.95
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX
      const dz = z - centerZ
      if (dx * dx + dz * dz > rSquared) continue
      if (disperse > 0 && (dx !== 0 || dz !== 0) && hashUnit(x, z) < disperse) continue
      nodes.push(z * sizeX + x)
    }
  }
  return nodes
}
