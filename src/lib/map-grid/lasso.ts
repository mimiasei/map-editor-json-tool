// ─── Map Grid lasso selection ─────────────────────────────────────────────────
// The Select tool's freehand shape: drag a loop around objects. Points are tile-space floats (x to the right, z up, tile (x, z) covers
// [x, x+1) × [z, z+1)); a tile is inside when its centre is.

export interface LassoPoint {
  x: number
  z: number
}

/** Even-odd test, so a self-crossing loop leaves its crossed-over lobes out instead of failing. */
function inside(points: readonly LassoPoint[], px: number, pz: number): boolean {
  let hit = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) hit = !hit
  }
  return hit
}

/** The nodes (`z * sizeX + x`) whose centre lies inside the polygon the points form (it closes back to the first point). */
export function nodesInPolygon(points: readonly LassoPoint[], sizeX: number, sizeZ: number): number[] {
  if (points.length < 3) return []
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const nodes: number[] = []
  for (let z = Math.max(0, Math.floor(minZ)); z <= Math.min(sizeZ - 1, Math.floor(maxZ)); z++) {
    for (let x = Math.max(0, Math.floor(minX)); x <= Math.min(sizeX - 1, Math.floor(maxX)); x++) {
      if (inside(points, x + 0.5, z + 0.5)) nodes.push(z * sizeX + x)
    }
  }
  return nodes
}
