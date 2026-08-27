// ─── Map grid — river tile connectivity + real shape-code derivation ────────
// Rivers are a flat set of {n, s, isWaterfall} entries in RawMapBlock2.rivers
// (see its own doc comment) — `s` is NOT a texture/rotation lookup as
// Core/DB/map/rivers/rivers.json's point/line/turn/join/cross/waterfall role
// list first suggested. Empirically mined against every non-waterfall river
// node across all 13 real sample maps with river data (2100+ nodes, esbuild-
// bundle-and-run technique per CLAUDE.md): `s` is a direct 4-bit connectivity
// bitmask over which of the node's 4 CARDINAL neighbors are also river tiles
// — E=1, W=2, N=4, S=8, summed. Every well-populated bucket matched exactly
// (E-W→3, N-S→12, S-W→10, E-N→5, N-W→6, E-S→9, E-S-W→11, E-N-S→13,
// E-N-W→7, N-S-W→14, single-neighbor points E/W/N/S→1/2/4/8, isolated→0),
// at 88-100% purity per bucket (the remainder is mostly nodes near a map
// edge or otherwise-unexplained noise, never a competing clean pattern).
// The 4-way cross (E-N-S-W→15) has only 13 real samples and no clean
// majority among them, but 15 is exactly what the bitmask formula predicts
// and every neighboring bucket is a clean formula match, so it's trusted by
// extension rather than direct majority — flagged here as the one value not
// independently confirmed. isWaterfall nodes use a visibly different, much
// noisier small value set (not this bitmask) — this module only derives `s`
// for non-waterfall river tiles; isWaterfall authoring is out of scope.

export type RiverDirection = 'N' | 'S' | 'E' | 'W'

const NEIGHBOR_OFFSETS: [number, number, RiverDirection][] = [
  [1, 0, 'E'],
  [-1, 0, 'W'],
  [0, 1, 'N'],
  [0, -1, 'S'],
]

/** Bit weight per direction — see this module's own doc comment for how
 *  this was empirically confirmed against real map data. */
const DIRECTION_BITS: Record<RiverDirection, number> = { E: 1, W: 2, N: 4, S: 8 }

export type RiverRole = 'isolated' | 'point' | 'line' | 'turn' | 'join' | 'cross'

function classifyRole(dirs: RiverDirection[]): RiverRole {
  if (dirs.length === 0) return 'isolated'
  if (dirs.length === 1) return 'point'
  if (dirs.length === 3) return 'join'
  if (dirs.length === 4) return 'cross'
  // dirs.length === 2: opposite directions (E+W or N+S) is a straight line,
  // any other pairing is a corner turn.
  const isOpposite = (dirs.includes('E') && dirs.includes('W')) || (dirs.includes('N') && dirs.includes('S'))
  return isOpposite ? 'line' : 'turn'
}

/**
 * Which of `node`'s 4 cardinal neighbors are also in `riverNodeSet`, plus a
 * role label for TSE's OWN abstract line rendering (isolated/point/line/
 * turn/join/cross) — independent of the real `s` value derived below, which
 * this module keeps as a clearly separate function since its correctness
 * affects real gameplay rendering, not just this editor's preview.
 */
export function classifyRiverNode(
  node: number,
  riverNodeSet: Set<number>,
  sizeX: number,
  sizeZ: number,
): { role: RiverRole; dirs: RiverDirection[] } {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  const dirs: RiverDirection[] = []
  for (const [dx, dz, dir] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    if (riverNodeSet.has(nz * sizeX + nx)) dirs.push(dir)
  }
  return { role: classifyRole(dirs), dirs }
}

/**
 * The real `s` value to write to disk for a node with the given connected
 * directions — a direct bitmask sum, see this module's doc comment for the
 * empirical confirmation. Takes `dirs` (not a role) since the bitmask is
 * computed directly from connectivity, with no role/rotation lookup table
 * needed.
 */
export function deriveRealShapeCode(dirs: RiverDirection[]): number {
  return dirs.reduce((sum, dir) => sum | DIRECTION_BITS[dir], 0)
}

/**
 * Recompute the real `s` value for every node in `nodesToCheck` that's still
 * present in `riverNodeSet` (deduped) — used both when a new stroke is
 * painted (the new nodes AND any pre-existing neighbor whose own shape just
 * changed need re-deriving) and when nodes are erased (the surviving
 * neighbors of a deleted node need re-deriving too, e.g. a straight line
 * losing one end becomes a point).
 */
export function computeShapeChanges(
  nodesToCheck: Iterable<number>,
  riverNodeSet: Set<number>,
  sizeX: number,
  sizeZ: number,
): { node: number; s: number }[] {
  const changes: { node: number; s: number }[] = []
  const seen = new Set<number>()
  for (const node of nodesToCheck) {
    if (seen.has(node) || !riverNodeSet.has(node)) continue
    seen.add(node)
    const { dirs } = classifyRiverNode(node, riverNodeSet, sizeX, sizeZ)
    changes.push({ node, s: deriveRealShapeCode(dirs) })
  }
  return changes
}
