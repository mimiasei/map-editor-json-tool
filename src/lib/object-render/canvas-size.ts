// Sizes of a render's canvas. Kept apart from render-core.ts so the render job on the main thread does not pull in
// three.js, which only the workers need.

/** Pixels per tile of the output (a render is 256 px per map tile before the app scales it). */
export const RENDER_PPU = 256
/** Camera elevation, degrees. */
export const ELEVATION = 25

/** Smallest canvas (px at RENDER_PPU) that holds the exported mesh and its shadow, from the exported bounding box. */
export function canvasForBounds(min: [number, number, number], max: [number, number, number]): number {
  const r = Math.max(Math.abs(min[0]), Math.abs(max[0]), Math.abs(min[2]), Math.abs(max[2]))
  const h = Math.max(max[1], 0)
  // Half the view height in tiles must cover the top (target y 0.8) and the ground footprint, with a margin for the shadow.
  const need = Math.max(2 * (r * 1.15 + 0.6), 2 * ((h - 0.8) * 0.906 + r * 0.42 + 0.4), 2 * (0.8 * 0.906 + r * 0.42 + 0.4))
  return CANVAS_STEPS.find((c) => c / RENDER_PPU >= need) ?? CANVAS_STEPS[CANVAS_STEPS.length - 1]
}

/** Canvas sizes tried in order; an object that still touches the border at the next size up is re-rendered there. */
export const CANVAS_STEPS = [1024, 1536, 2048, 3072]
