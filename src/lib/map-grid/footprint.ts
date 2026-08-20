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
  return cells
}
