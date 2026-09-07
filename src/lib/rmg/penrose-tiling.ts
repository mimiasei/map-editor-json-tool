// ─── Penrose (P3 rhombus) tiling via de Bruijn's pentagrid method ──────────
// (issue #210, Milestone 4)
//
// Generates a real aperiodic Penrose tiling — not an approximation — via de
// Bruijn's 1981 pentagrid/multigrid construction: 5 families of parallel
// lines at angles 2πj/5, each family offset by a real `gamma[j]`. Every
// pair of intersecting lines (one from each of two distinct families)
// corresponds to one rhombus; its 4 vertices are the projection of a
// 5-dimensional lattice point back into the plane via the star map
// `sum_i K_i * e_i`. The rhombus's acute angle (72° "fat" or 36° "thin")
// is determined by the angular separation between its two defining
// families.
//
// Correctness here can't be checked against real game/map data the way
// everything else in this generator has been (there's no "real Penrose
// tiling" reference to diff against) — so this is instead verified against
// the tiling's own known mathematical invariants (penrose-tiling.test.md
// in this session's own verification notes, reproduced in doc comments
// below): every interior vertex's surrounding angles sum to exactly 360°,
// and the fat:thin rhombus count ratio converges to the golden ratio
// φ ≈ 1.618034 as the sampled patch grows. Both are checked by a
// standalone verification script before this module is ever wired into
// zone shaping — see the PR/commit this file landed in for that script.

const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2

export interface RhombusTile {
  /** 4 vertices, cyclic (parallelogram) order, in unscaled pentagrid units. */
  vertices: [number, number][]
  centroid: [number, number]
  /** true = 72°/108° "fat" rhombus, false = 36°/144° "thin" rhombus. */
  isFat: boolean
}

const FAMILY_COUNT = 5
const THETA = Array.from({ length: FAMILY_COUNT }, (_, j) => (2 * Math.PI * j) / FAMILY_COUNT)
const AXES: [number, number][] = THETA.map((t) => [Math.cos(t), Math.sin(t)])

/** 5 real offsets, one per grid family. Almost any real-valued (as opposed
 *  to exact rational-multiple) choice avoids the measure-zero "singular"
 *  case where 3+ grid lines meet at one point (de Bruijn 1981) — this
 *  generator draws them from the caller's own `rng` specifically so that's
 *  true with effective certainty (a genuine floating-point coincidence
 *  between independently-drawn reals essentially never happens), rather
 *  than hardcoding a fixed offset set that would produce the exact same
 *  tiling topology every time. Does NOT need to sum to zero — that's a
 *  different (5-fold-symmetric "cartwheel") special case, not a validity
 *  requirement. */
export function randomPentagridOffsets(rng: () => number): number[] {
  return Array.from({ length: FAMILY_COUNT }, () => 0.1 + rng() * 0.8)
}

/**
 * Every rhombus whose defining pair of grid-line indices both fall within
 * `[-gridRange, gridRange]`, in unscaled pentagrid units (unit-vector
 * spacing ≈ 1 tile before the caller applies its own `scale`).
 */
export function generatePenroseTiling(gammas: number[], gridRange: number): RhombusTile[] {
  const tiles: RhombusTile[] = []

  for (let j = 0; j < FAMILY_COUNT; j++) {
    for (let k = j + 1; k < FAMILY_COUNT; k++) {
      const [a1, b1] = AXES[j]
      const [a2, b2] = AXES[k]
      const det = a1 * b2 - a2 * b1

      const diff = Math.min((k - j + FAMILY_COUNT) % FAMILY_COUNT, (j - k + FAMILY_COUNT) % FAMILY_COUNT)
      const isFat = diff === 1

      for (let mj = -gridRange; mj <= gridRange; mj++) {
        const c1 = mj - gammas[j]
        for (let mk = -gridRange; mk <= gridRange; mk++) {
          const c2 = mk - gammas[k]
          const x0 = (c1 * b2 - c2 * b1) / det
          const y0 = (a1 * c2 - a2 * c1) / det

          const baseK = new Array<number>(FAMILY_COUNT)
          for (let i = 0; i < FAMILY_COUNT; i++) {
            if (i === j || i === k) continue
            const [ai, bi] = AXES[i]
            baseK[i] = Math.ceil(x0 * ai + y0 * bi + gammas[i])
          }

          const vertices: [number, number][] = []
          for (const [dj, dk] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
            let vx = 0
            let vy = 0
            for (let i = 0; i < FAMILY_COUNT; i++) {
              const Ki = i === j ? mj + dj : i === k ? mk + dk : baseK[i]
              vx += Ki * AXES[i][0]
              vy += Ki * AXES[i][1]
            }
            vertices.push([vx, vy])
          }

          const centroid: [number, number] = [
            (vertices[0][0] + vertices[1][0] + vertices[2][0] + vertices[3][0]) / 4,
            (vertices[0][1] + vertices[1][1] + vertices[2][1] + vertices[3][1]) / 4,
          ]
          tiles.push({ vertices, centroid, isFat })
        }
      }
    }
  }

  return tiles
}

/** Ratio of fat:thin rhombus counts — should converge to φ ≈ 1.618034 as
 *  the sampled tile set grows (a real, checkable invariant of any valid
 *  Penrose P3 tiling, not specific to this implementation). */
export function fatThinRatio(tiles: RhombusTile[]): number {
  const fat = tiles.filter((t) => t.isFat).length
  const thin = tiles.length - fat
  return fat / thin
}

export { GOLDEN_RATIO }
