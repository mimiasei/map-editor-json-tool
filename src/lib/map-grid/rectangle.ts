// ─── Map grid — rectangle-drag bounds + enclosed node set ────────────────────
// Pure geometry for the Rectangle interaction mode (issue #193 Phase 4) — no
// file I/O, no React. Mirrors Tiled's Rectangle tool: Shift constrains to a
// square, Alt anchors the drag's start point as the center instead of a
// corner (both can combine into a centered square).

export interface RectangleBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * The rectangle's tile-space bounds for a drag from `(startX, startZ)` to
 * `(curX, curZ)`, given the current modifier keys. `sizeX`/`sizeZ` clamp the
 * result to the map's own bounds (a drag can go negative or past the edge
 * while the pointer is over empty space outside the grid).
 */
export function computeRectangleBounds(
  startX: number,
  startZ: number,
  curX: number,
  curZ: number,
  square: boolean,
  centered: boolean,
  sizeX: number,
  sizeZ: number,
): RectangleBounds {
  let dx = curX - startX
  let dz = curZ - startZ
  if (square) {
    const d = Math.max(Math.abs(dx), Math.abs(dz))
    dx = dx < 0 ? -d : d
    dz = dz < 0 ? -d : d
  }
  let minX: number, maxX: number, minZ: number, maxZ: number
  if (centered) {
    minX = startX - Math.abs(dx)
    maxX = startX + Math.abs(dx)
    minZ = startZ - Math.abs(dz)
    maxZ = startZ + Math.abs(dz)
  } else {
    minX = Math.min(startX, startX + dx)
    maxX = Math.max(startX, startX + dx)
    minZ = Math.min(startZ, startZ + dz)
    maxZ = Math.max(startZ, startZ + dz)
  }
  return {
    minX: Math.max(0, minX),
    maxX: Math.min(sizeX - 1, maxX),
    minZ: Math.max(0, minZ),
    maxZ: Math.min(sizeZ - 1, maxZ),
  }
}

/** Every node index inside `bounds` (inclusive), row-major (node = z*sizeX+x). */
export function nodesInRectangle(bounds: RectangleBounds, sizeX: number): number[] {
  const nodes: number[] = []
  for (let z = bounds.minZ; z <= bounds.maxZ; z++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      nodes.push(z * sizeX + x)
    }
  }
  return nodes
}
