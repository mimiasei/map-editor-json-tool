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
// Anchor math (pivotX/pivotZ): X and Z are NOT symmetric, confirmed against
// real ground truth (2026-09-07, the "Bug A" load-crash investigation) — X
// extends forward from the anchor (`anchorX + lx - pivotX`), but Z extends
// BACKWARD (`anchorZ - lz + pivotZ`). This was found by decoding a real GME-
// saved map with one city-spawner in each of two opposite corners
// (`maps/gme_onecityeachcorner.map`, anchors at node (x=0,z=15) and
// (x=13,z=2) on a 16x16 map) and pixel-analyzing a real screenshot of it in
// GME's own viewport: both cities' rendered 3x3 highlight occupied the tiles
// BEHIND their anchor in Z (e.g. anchor z=15 occupied z={13,14,15}, not
// z={15,16,17}), while occupying tiles AHEAD of their anchor in X. This is
// also provable independent of any screen-rendering convention: anchor z=15
// on a 16-tall map (valid z range 0-15) forward-extended by 2 would require
// z=16/17, which aren't valid tile indices at all — yet GME placed and
// rendered the object there without issue, so the local z index must
// subtract, not add. Confirmed NOT explained by "centered pivot + auto-
// clamp near an edge" either: the second corner's anchor (z=2) had room for
// a centered ±1 footprint on both sides (z=1..3, no clamping would ever
// trigger) and still occupied z={0,1,2} — pure backward extension, even away
// from any edge.
//
// This was previously coded as `anchorZ + lz - pivotZ` (same direction as
// X), based on the pattern in CustomObjectEditorDialog.tsx's
// CORNER_1X1_PATTERNS/addInteractionRing (issue #146). That formula was only
// ever checked against real templates' own `nodes[]` shape (issue #167) —
// never against an external, independently-rendered ground truth — so the
// wrong Z sign went unnoticed. It only matters for BOUNDS purposes on an
// off-center-pivot template (`pivotZ` not equal to `(sizeZ-1)/2` — true for
// `city-spawner`/`hero-spawner`/`random-city`, all `pivotZ:0` on a 3-tall
// footprint, per `Core/DB/map/objects/7_spawns.json`): a CENTERED-pivot
// template (e.g. `random-hero`/`random-squad`/`random-item`/`random-res`,
// all `pivotZ:1` for the same 3-tall size) occupies the identical set of
// world tiles either direction, just in reverse local order — confirmed no
// regression there. This exact bug is what let a city-spawner get placed 1
// tile from a map edge in TSE (its old, wrong forward-Z footprint read as
// fully in-bounds) that then crashed the actual game on load — the real
// footprint's back row fell one tile off the map.
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
      z: anchorZ - lz + pivotZ,
      value: template.nodes[i],
    })
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

/** S = {entrance cell(s)} ∪ {footprint cells that are 4-directionally (edge-)adjacent
 * to an entrance cell}. For city-spawner's real template (nodes:[1,1,1,1,1,1,2,1,1],
 * entrance at local index 6 = lx0,lz2), the footprint-neighbors sharing an edge with
 * the entrance are local index 3 (lx0,lz1 — directly behind it) and
 * local index 7 (lx1,lz2 — beside it in the same row) — these are your "1" and "3".
 * The far corners/edge (index 0,2,5,8 in real local terms) aren't adjacent to the entrance,
 * so they're excluded — matches your "2,5,6,8 don't matter." */
export function protectedNeighborNodes(cells: FootprintCell[], sizeX: number, sizeZ: number): Set<number> {
    const ownNodes = new Set(cells.map((c) => c.z * sizeX + c.x))
    const entranceCells = cells.filter((c) => c.value === 2)
    const coreCells = entranceCells.concat(
        cells.filter((c) => c.value === 1 && entranceCells.some((e) =>
            (Math.abs(e.x - c.x) === 1 && e.z === c.z) || (Math.abs(e.z - c.z) === 1 && e.x === c.x)
        ))
    )
    const result = new Set<number>()
    for (const cell of coreCells) {
        for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { // or 8-way if you want diagonals too
            const x = cell.x + dx, z = cell.z + dz
            if (x < 0 || x >= sizeX || z < 0 || z >= sizeZ) continue
            const node = z * sizeX + x
            if (!ownNodes.has(node)) result.add(node)
        }
    }
    return result
}

/**
 * Clamps an anchor tile so its footprint (per `computeFootprintTiles`'s
 * X-forward/Z-backward convention above) fits fully within `sizeX`x`sizeZ` —
 * for a placement that MUST happen somewhere (RMG's own player city-spawner/
 * hero-spawner, confirmed 2026-09-07 to have no bounds awareness at all: its
 * anchor is picked purely as the nearest zone-owned tile to a relaxed zone
 * center, with no footprint check, so a small map's ~1-tile zone-center
 * inset can leave a 3-wide footprint no room — see generate-terrain.ts's own
 * comment at the zoneAnchorNode/players[] site). Every other RMG placement
 * (zone-population.ts's tryPlaceAt/tryPlace) instead just rejects a
 * candidate tile and tries another, which isn't an option for "this
 * player's one and only start position." Falls back to a plain single-tile
 * clamp when the template can't be resolved or has no real footprint,
 * matching computeFootprintTiles' own single-anchor-cell fallback.
 */
export function clampAnchorToFootprintBounds(
  template: FootprintTemplate | undefined,
  anchorX: number,
  anchorZ: number,
  sizeX: number,
  sizeZ: number,
): { x: number; z: number } {
  const tplSizeX = template?.nodes?.length ? (template.sizeX ?? 1) : 1
  const tplSizeZ = template?.nodes?.length ? (template.sizeZ ?? 1) : 1
  const pivotX = template?.pivotX ?? 0
  const pivotZ = template?.pivotZ ?? 0
  const minX = pivotX
  const maxX = Math.max(minX, sizeX - tplSizeX + pivotX)
  const minZ = tplSizeZ - 1 - pivotZ
  const maxZ = Math.max(minZ, sizeZ - 1 - pivotZ)
  return {
    x: Math.min(Math.max(anchorX, minX), maxX),
    z: Math.min(Math.max(anchorZ, minZ), maxZ),
  }
}
