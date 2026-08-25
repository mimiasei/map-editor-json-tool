// ─── Map grid — object footprint computation ─────────────────────────────────
// Confirmed against every real Core/DB/map/objects/*.json template (858
// entries, all 9 category files) during the Move/Add/Delete + blocked-tile-
// overlay feasibility research (issue #167 and the follow-on passability
// plan): ~73% of real templates are bigger than 1×1 (3×3 alone is 404 of
// 858), and each template's `nodes[]` (row-major, length sizeX*sizeZ) marks
// every cell `0` (empty/unused), `1` (solid/blocked footprint), or `2`
// (walkable interaction cell — a hero must stand here to interact, never
// blocked). Environments/animals/fxs/blocks (non-interactive decorations)
// only ever use `0`/`1`; interactables/artifacts/resources/spawns mix in `2`
// for their entrance cell(s).
//
// Anchor math (pivotX/pivotZ) is not new here — it's the exact formula
// already implemented and tested in CustomObjectEditorDialog.tsx's
// CORNER_1X1_PATTERNS/addInteractionRing (built for issue #146's from-scratch
// object footprint padding): given a placed instance's anchor tile and the
// template's sizeX/sizeZ/nodes/pivotX/pivotZ (default 0,0 when absent), local
// grid index `i` (`lx = i % sizeX`, `lz = Math.floor(i / sizeX)`) maps to
// world tile `(anchorX + lx - pivotX, anchorZ + lz - pivotZ)`.
//
// Rotation is a known, deliberately out-of-scope gap: the mapmaking guide
// confirms rotation 0/1/2/3 = 0/90/180/270°, and a 90°/270° rotation should
// swap sizeX/sizeZ for a fully accurate footprint — but this only affects the
// 11 of 858 real templates that are non-square (everything else is
// rotation-invariant for bounding-box purposes), so it's not implemented
// here rather than risk an unverified pivot-under-rotation transform for such
// a small edge case. Flagged, not silently wrong.

export interface FootprintTemplate {
  sizeX?: number
  sizeZ?: number
  nodes?: number[]
  pivotX?: number
  pivotZ?: number
}

export interface FootprintCell {
  x: number
  z: number
  /** The template's raw per-cell value at this tile: 0 = empty, 1 = solid/
   *  blocked, 2 = walkable interaction cell. */
  value: number
}

/**
 * Every tile a placed instance's footprint occupies, in world (x, z)
 * coordinates, each tagged with its template value. Falls back to a single
 * Two distinct "no data" cases, confirmed to mean different things (real
 * template survey, 858 entries): a genuinely *unresolvable* sid (no Core.zip
 * loaded, or an id missing from the catalog entirely) falls back to a single
 * `{anchorX, anchorZ, value: 1}` cell — the safest minimal assumption, since
 * we have no idea what this object actually is. But a *resolved* template
 * that has no `nodes[]` at all is a confirmed, deliberate "no footprint"
 * declaration, not missing data — every one of the 90 real templates that
 * omit `nodes[]` is either a pure visual effect (`fx_map_fire`, `fx_map_smoke`,
 * quest-marker sparkles, ...) or small walkable-through ground clutter
 * (`grass_1`, `mushrooms_1`, `water_reed_1`, `grass_stones_1`, ...) — never a
 * solid object (mountains/rocks/trees always declare an explicit `nodes:[1]`
 * even at 1×1). That case returns a non-blocking `value: 0` cell instead.
 */
export function computeFootprintTiles(
  template: FootprintTemplate | undefined,
  anchorX: number,
  anchorZ: number,
  sid?: string,
): FootprintCell[] {
  if (!template) {
    return [{ x: anchorX, z: anchorZ, value: 1 }]
  }
  if (!template.nodes?.length) {
    return [{ x: anchorX, z: anchorZ, value: 0 }]
  }
  const sizeX = template.sizeX ?? 1
  const pivotX = template.pivotX ?? 0
  const pivotZ = template.pivotZ ?? 0
  const cells: FootprintCell[] = []
  for (let i = 0; i < template.nodes.length; i++) {
    const lx = i % sizeX
    const lz = Math.floor(i / sizeX)
    cells.push({
      x: anchorX + lx - pivotX,
      z: anchorZ + lz - pivotZ,
      value: template.nodes[i],
    })
  }
  // hero-spawner shares city-spawner's 3×3 catalog template (8 solid "1"
  // cells around one "2" interaction cell), which is correct for a
  // city-spawner — a real building occupying its full footprint — but not
  // for a hero-spawner: confirmed in-game, the hero itself is a single-tile
  // character standing at that one "2" cell, not a 3×3 structure. Override
  // the whole footprint (not just icon rendering) to that one cell, marked
  // solid, so click-hit-testing, blocked-tile passability, and move/place
  // bounds-checking all agree it's a genuine 1×1 object instead of treating
  // the other 8 cells of the shared template as real, blocking, in-game space.
  if (sid === 'hero-spawner') {
    const interactionCell = cells.find((cell) => cell.value === 2)
    if (interactionCell) return [{ x: interactionCell.x, z: interactionCell.z, value: 1 }]
  }
  return cells
}

export interface FootprintBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Tight world-space bounding box over a footprint's *visual* (`value === 1`)
 * cells only — ignoring `2` (interaction-only, no mesh) and `0` (empty). This
 * is why an artifact/resource template (a single "1" padded by an 8-cell "2"
 * ring, per the real-catalog survey) still renders as a plain 1×1 icon, while
 * an all-"1" environment decoration renders spanning its full size. Returns
 * `null` only if the footprint has no "1" cells at all (e.g. a pure-FX/ground-
 * clutter template with no `nodes[]`, see computeFootprintTiles' doc comment).
 */
export function footprintIconBounds(cells: FootprintCell[]): FootprintBounds | null {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const cell of cells) {
    if (cell.value !== 1) continue
    if (cell.x < minX) minX = cell.x
    if (cell.x > maxX) maxX = cell.x
    if (cell.z < minZ) minZ = cell.z
    if (cell.z > maxZ) maxZ = cell.z
  }
  if (minX === Infinity) return null
  return { minX, maxX, minZ, maxZ }
}

/** Whether every one of a footprint's cells falls within the map's bounds —
 *  used by Move (issue #167 Phase A) to refuse a destination that would push
 *  any part of a multi-tile object off the edge of the map. */
export function isFootprintInBounds(cells: FootprintCell[], sizeX: number, sizeZ: number): boolean {
  return cells.every((cell) => cell.x >= 0 && cell.x < sizeX && cell.z >= 0 && cell.z < sizeZ)
}
