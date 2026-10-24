// ─── Cliff pieces along the edges of raised ground ───────────────────────────
// The game builds cliffs from a set of prefabs under cliffs/prefabs/ (straight walls, diagonal corners, rubble, and "vertical" ones that
// span two levels). The sidecar renders every piece turned to four sides (lib/object-render, job "cliffs"); this picks which render
// goes on which tile. A piece lies on the LOWER tile: a straight piece's wall runs along the tile edge that touches the higher
// neighbour (turn 0 = high ground to the north, 90 = west, 180 = south, 270 = east; verified by looking at the renders and at game
// screenshots). Rules for diagonals and rubble are inferred from those renders and screenshots, not from the game's own placement code.
//
// Walls whose face turns away from the camera (high ground to the south or east) are drawn as "rim" renders, the top of the wall only:
// the raised ground hides the rest, as in the game.

export interface CliffPiece {
  /** The low tile the piece lies on. */
  node: number
  /** Render sid, e.g. cliff_straight_03_top_r180. */
  sid: string
  /** Rubble lies on the ground; walls and diagonals are drawn shifted down by their height, see CLIFF_TOP_SHIFT. */
  wall: boolean
}

/** Variants rendered per piece kind (cliffs/prefabs/cliff_<kind>_00.. in the game data). */
const VARIANTS = { straight: 8, vertical_straight: 4, diagonal: 3, vertical_diagonal: 3, corner: 3 } as const
type Kind = keyof typeof VARIANTS

/** How far down a wall's sprite moves so its top lines up with the boundary between the high and the low tile: wall height 0.68 x cos(25 deg). */
export const CLIFF_TOP_SHIFT = 0.62

/** Direction of the higher neighbour -> turn of the piece, whether it is drawn as a rim, and the offset. */
const ORTHOGONAL = [
  { dx: 0, dz: 1, rot: 0, rim: false },   // high to the north
  { dx: -1, dz: 0, rot: 90, rim: false }, // west
  { dx: 0, dz: -1, rot: 180, rim: true }, // south
  { dx: 1, dz: 0, rot: 270, rim: true },  // east
] as const
/** Diagonal higher neighbour -> turn (a diagonal at turn 0 joins the walls of a corner whose plateau lies to the north-west). */
const DIAGONAL = [
  { dx: -1, dz: 1, rot: 0, rim: false },
  { dx: -1, dz: -1, rot: 90, rim: true },
  { dx: 1, dz: -1, rot: 180, rim: true },
  { dx: 1, dz: 1, rot: 270, rim: false },
] as const

/** Stable pseudo-random pick, so a piece does not change when the map is repainted elsewhere. */
function pick(node: number, salt: number, count: number): number {
  let h = Math.imul(node + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) % count
}

export function cliffSid(kind: Kind, variant: number, rot: number, rim: boolean): string {
  return `cliff_${kind}_${String(variant).padStart(2, '0')}${rim ? '_top' : ''}_r${rot}`
}

/**
 * Pieces for the whole map, back (north) first so nearer walls overlap farther ones. `levels` is levelsMap (-1/0/1) and `climbs` marks
 * ramps; node = z * sizeX + x, z grows to the north.
 */
export function buildCliffPieces(sizeX: number, sizeZ: number, levels: ArrayLike<number>, climbs: ArrayLike<number>): CliffPiece[] {
  const level = (x: number, z: number) => (x < 0 || z < 0 || x >= sizeX || z >= sizeZ ? null : (levels[z * sizeX + x] ?? 0))
  const ramp = (x: number, z: number) => (climbs[z * sizeX + x] ?? 0) !== 0
  const pieces: CliffPiece[] = []
  for (let z = sizeZ - 1; z >= 0; z--) {
    for (let x = 0; x < sizeX; x++) {
      const here = level(x, z)!
      const node = z * sizeX + x
      if (ramp(x, z)) continue
      /** Higher neighbour at an offset, unless a ramp is involved (ramps are the way up, no cliff there). */
      const higher = (dx: number, dz: number): number => {
        const there = level(x + dx, z + dz)
        if (there === null || there <= here || ramp(x + dx, z + dz)) return 0
        return there - here
      }
      let walls = 0
      for (const o of ORTHOGONAL) {
        const diff = higher(o.dx, o.dz)
        if (!diff) continue
        walls++
        const kind: Kind = diff >= 2 ? 'vertical_straight' : 'straight'
        pieces.push({ node, sid: cliffSid(kind, pick(node, o.rot, VARIANTS[kind]), o.rot, o.rim), wall: true })
      }
      if (walls === 0) {
        // Only a diagonal neighbour is higher: the outside of a convex corner.
        for (const d of DIAGONAL) {
          const diff = higher(d.dx, d.dz)
          if (!diff) continue
          const kind: Kind = diff >= 2 ? 'vertical_diagonal' : 'diagonal'
          pieces.push({ node, sid: cliffSid(kind, pick(node, d.rot + 7, VARIANTS[kind]), d.rot, d.rim), wall: true })
          break
        }
      } else if (walls >= 2) {
        // Two walls meet at an inner corner: rubble piles up in the crevice.
        pieces.push({ node, sid: cliffSid('corner', pick(node, 99, VARIANTS.corner), [0, 90, 180, 270][pick(node, 5, 4)], false), wall: false })
      }
    }
  }
  return pieces
}
