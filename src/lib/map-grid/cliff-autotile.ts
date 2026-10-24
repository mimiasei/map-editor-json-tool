// ─── Cliff pieces along the edges of raised ground ───────────────────────────
// The game builds cliffs from a set of prefabs under cliffs/prefabs/ (straight walls, diagonal corners, rubble, and "vertical" ones that
// span two levels). The sidecar renders every piece turned to four sides (lib/object-render, job "cliffs"); this picks which render
// goes where. What the piece geometry and the game screenshots show:
//  - A straight piece lies on the LOWER tile: its wall runs along the tile edge that touches the higher neighbour (turn 0 = high ground
//    to the north, 90 = west, 180 = south, 270 = east), rubble spills onto the low tile.
//  - A diagonal piece's wall runs corner to corner through ONE tile (its top is a 45 degree line from one corner of the tile to the opposite
//    one) and its ends meet the straight walls on both sides. The game cuts every convex corner of raised ground with it, which is the
//    chamfered outline in the screenshots: it sits on the corner's HIGH tile, and the two straight walls that would have met there are left out.
//    Turn 0 cuts the south-west corner (its wall runs from the north-west to the south-east and the face looks south-west; read from the
//    piece geometry), 90 the south-east corner, 180 the north-east, 270 the north-west.
// Walls whose face looks north (high ground to the south, and the two corners on the north side) are drawn as "top" renders: the top of
// the wall only, because the raised ground hides the rest. East, west and south walls show some of the cliff side, as in the game screenshots.
// The placement rules are inferred from the renders and screenshots, not from the game's own code.

import { CLIFF_ELEVATION, CLIFF_TAG } from '@/lib/object-render/canvas-size'

export interface CliffPiece {
  /** The tile the piece is drawn on. */
  node: number
  /** Render sid, e.g. cliff_straight_03_top_r180_e60m. */
  sid: string
  /** Rubble lies on the ground; walls and diagonals are drawn shifted down by their height, see CLIFF_TOP_SHIFT. */
  wall: boolean
}

/** Variants rendered per piece kind (cliffs/prefabs/cliff_<kind>_00.. in the game data). */
const VARIANTS = { straight: 8, vertical_straight: 4, diagonal: 3, vertical_diagonal: 3, corner: 3 } as const
type Kind = keyof typeof VARIANTS

/** How far down a wall's sprite moves so its top lines up with the boundary between the high and the low tile: wall height 0.68 x cos(camera elevation). */
export const CLIFF_TOP_SHIFT = 0.68 * Math.cos((CLIFF_ELEVATION * Math.PI) / 180)

/** Offset of the higher neighbour -> turn of the straight piece on the low tile, and whether it is drawn as a top. */
const ORTHOGONAL = [
  { dx: 0, dz: 1, rot: 0, top: false },   // high to the north
  { dx: -1, dz: 0, rot: 90, top: false }, // high to the west: the plateau's east edge, full face in shadow
  { dx: 0, dz: -1, rot: 180, top: true }, // south
  { dx: 1, dz: 0, rot: 270, top: 'side' }, // high to the east: the plateau's west edge, a narrow band of the face
] as const

/**
 * Convex corners of raised ground, seen from the corner's high tile: (sx, sz) points out of the corner (the diagonal is toward it), the
 * face of its diagonal looks that way.
 */
const CORNERS = [
  { rot: 0, top: false, sx: -1, sz: -1 },  // south-west corner
  { rot: 90, top: false, sx: 1, sz: -1 },   // south-east
  { rot: 180, top: true, sx: 1, sz: 1 },    // north-east
  { rot: 270, top: true, sx: -1, sz: 1 },   // north-west
] as const

/** A corner is cut over two tiles per side (as in the game screenshots) when each of the two walls is at least this many tiles long. */
const LONG_WALL = 4

/** Stable pseudo-random pick, so a piece does not change when the map is repainted elsewhere. */
function pick(node: number, salt: number, count: number): number {
  let h = Math.imul(node + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return (h >>> 0) % count
}

export function cliffSid(kind: Kind, variant: number, rot: number, style: boolean | 'side'): string {
  const part = style === 'side' ? '_side' : style ? '_top' : ''
  return `cliff_${kind}_${String(variant).padStart(2, '0')}${part}_r${rot}_${CLIFF_TAG}`
}

/**
 * Pieces for the whole map, back (north) first so nearer walls overlap farther ones. `levels` is levelsMap (-1/0/1) and `climbs` marks
 * ramps; node = z * sizeX + x, z grows to the north.
 */
export function buildCliffPieces(sizeX: number, sizeZ: number, levels: ArrayLike<number>, climbs: ArrayLike<number>): CliffPiece[] {
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < sizeX && z < sizeZ
  const level = (x: number, z: number) => levels[z * sizeX + x] ?? 0
  const ramp = (x: number, z: number) => (climbs[z * sizeX + x] ?? 0) !== 0
  const pieces: { piece: CliffPiece; z: number }[] = []
  const add = (x: number, z: number, sid: string, wall: boolean) => pieces.push({ piece: { node: z * sizeX + x, sid, wall }, z })
  const rubble = (x: number, z: number, salt: number) =>
    add(x, z, cliffSid('corner', pick(z * sizeX + x, salt, VARIANTS.corner), [0, 90, 180, 270][pick(z * sizeX + x, 5, 4)], false), false)

  // Convex corners first: each one replaces the straight walls beside it.
  const cut = new Set<number>() // low node * 4 + index into ORTHOGONAL of a straight wall that a diagonal replaces
  const consume = (lx: number, lz: number, hx: number, hz: number) => {
    const idx = ORTHOGONAL.findIndex((o) => lx + o.dx === hx && lz + o.dz === hz)
    if (idx >= 0) cut.add((lz * sizeX + lx) * 4 + idx)
  }
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      if (ramp(x, z)) continue
      const here = level(x, z)
      const lower = (px: number, pz: number) => inside(px, pz) && !ramp(px, pz) && level(px, pz) < here
      /** Tiles from here along (dx, dz) that are part of the same wall: as high as this one, with a lower tile on the outer side. */
      const run = (dx: number, dz: number, ox: number, oz: number) => {
        let n = 0
        while (inside(x + dx * n, z + dz * n) && !ramp(x + dx * n, z + dz * n) && level(x + dx * n, z + dz * n) === here && lower(x + dx * n + ox, z + dz * n + oz)) n++
        return n
      }
      for (const c of CORNERS) {
        if (!lower(x, z + c.sz) || !lower(x + c.sx, z) || !lower(x + c.sx, z + c.sz)) continue
        const drop = here - Math.max(level(x, z + c.sz), level(x + c.sx, z), level(x + c.sx, z + c.sz))
        const kind: Kind = drop >= 2 ? 'vertical_diagonal' : 'diagonal'
        const diagonal = (px: number, pz: number) => add(px, pz, cliffSid(kind, pick(pz * sizeX + px, c.rot + 7, VARIANTS[kind]), c.rot, c.top), true)
        if (run(-c.sx, 0, 0, c.sz) >= LONG_WALL && run(0, -c.sz, c.sx, 0) >= LONG_WALL) {
          // Long walls: the corner tile itself drops out and two diagonals run from one wall to the other (a cut of two tiles per side).
          diagonal(x - c.sx, z)
          diagonal(x, z - c.sz)
          consume(x - c.sx, z + c.sz, x - c.sx, z)
          consume(x, z + c.sz, x, z)
          consume(x + c.sx, z, x, z)
          consume(x + c.sx, z - c.sz, x, z - c.sz)
        } else {
          diagonal(x, z)
          consume(x, z + c.sz, x, z)
          consume(x + c.sx, z, x, z)
        }
      }
    }
  }

  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      if (ramp(x, z)) continue
      const here = level(x, z)
      const node = z * sizeX + x
      let walls = 0
      ORTHOGONAL.forEach((o, i) => {
        const nx = x + o.dx
        const nz = z + o.dz
        if (!inside(nx, nz) || ramp(nx, nz) || level(nx, nz) <= here) return
        walls++
        if (cut.has(node * 4 + i)) return
        const kind: Kind = level(nx, nz) - here >= 2 ? 'vertical_straight' : 'straight'
        add(x, z, cliffSid(kind, pick(node, o.rot, VARIANTS[kind]), o.rot, o.top), true)
      })
      // Two walls meeting at an inner corner: rubble piles up in the crevice.
      if (walls >= 2) rubble(x, z, 99)
    }
  }
  // Back (north) rows first; the sort is stable, so within a row pieces keep the order they were added in.
  return pieces.sort((a, b) => b.z - a.z).map((p) => p.piece)
}
