// ─── Shared terrain canvas paint (issue #210, live RMG preview) ────────────
// Extracted from MapGridDialog.tsx's own canvas-overview base-fill pass so
// the Random Map Generator's live preview canvas (GenerateRandomMapDialog.tsx)
// can share the exact same terrain-color rendering instead of a second,
// hand-copied loop — both call sites now stay in sync by construction.
// `terrainFillColor`/`buildElevationTintMap` were already pure (no store
// coupling), just the surrounding canvas-paint loop itself wasn't factored
// out before this.

import { terrainFillColor } from './terrain-colors'

/** A distinct, semi-opaque highlight for a previewed road/river tile — the
 *  real game's own road/river rendering is a separate sub-tile-resolution
 *  line-feature canvas (MapGridDialog.tsx's own `lineFeatureCanvasEl`), not
 *  reproduced here since a rough 1px/tile preview has no use for that
 *  fidelity; this is a "here's roughly where it'll run" indicator only. */
const ROAD_PREVIEW_COLOR = 'rgba(120, 72, 24, 0.85)'

/**
 * Paints one pixel per tile: terrain/water fill (`terrainFillColor`) for
 * every tile, then an optional opaque road/river highlight on top. Assumes
 * `ctx.canvas.width/height` are already set to `sizeX`/`sizeZ` by the
 * caller (both existing call sites size their canvas once on mount/resize,
 * not on every paint).
 */
export function paintTerrainCanvas(
  ctx: CanvasRenderingContext2D,
  sizeX: number,
  sizeZ: number,
  tilesMap: number[],
  waterMap: number[],
  opacity?: number,
  roadNodes?: Set<number>,
): void {
  ctx.clearRect(0, 0, sizeX, sizeZ)
  const tileCount = sizeX * sizeZ
  if (tilesMap.length !== tileCount) return
  for (let node = 0; node < tileCount; node++) {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    ctx.fillStyle = terrainFillColor(tilesMap[node], waterMap[node], opacity)
    ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
  }
  if (roadNodes) {
    ctx.fillStyle = ROAD_PREVIEW_COLOR
    for (const node of roadNodes) {
      const x = node % sizeX
      const z = Math.floor(node / sizeX)
      ctx.fillRect(x, sizeZ - 1 - z, 1, 1)
    }
  }
}
