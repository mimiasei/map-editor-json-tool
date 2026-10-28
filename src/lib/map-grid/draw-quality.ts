// ─── How finely the Map Grid draws each layer ────────────────────────────────
// Ground textures, cliffs, roads and rivers are drawn on canvases of `pxPerTile` pixels per tile, and a canvas costs width x height x 4
// bytes of memory (plus the GPU's copy), so a big map at a high setting is heavy. Each layer therefore has a ceiling on pixels per tile
// and on the canvas's side; the tile size used is the largest that fits both. Objects are DOM icons: their cost is how many are mounted.
// "High" is what the grid always used before this setting existed.

export interface CanvasLayerQuality {
  /** Most canvas pixels per tile this layer may use. */
  pxPerTile: number
  /** Longest side of the layer's canvas in pixels; a bigger map gets fewer pixels per tile instead. */
  maxSide: number
}

export interface DrawQuality {
  /** Ground textures under the terrain colours. */
  terrain: CanvasLayerQuality
  /** Cliff edges and ramps. */
  cliffs: CanvasLayerQuality
  /** Roads and rivers. */
  lines: CanvasLayerQuality
  objects: {
    /** Icons of objects appear once a tile is at least this many screen pixels wide (below that only colour swatches are drawn). */
    iconFromPx: number
  }
}

export type DrawQualityPreset = 'low' | 'medium' | 'high' | 'ultra'
export type DrawQualityChoice = DrawQualityPreset | 'custom'

export const DRAW_QUALITY_PRESETS: Record<DrawQualityPreset, DrawQuality> = {
  low: {
    terrain: { pxPerTile: 16, maxSide: 2048 },
    cliffs: { pxPerTile: 16, maxSide: 2048 },
    lines: { pxPerTile: 24, maxSide: 2048 },
    objects: { iconFromPx: 24 },
  },
  medium: {
    terrain: { pxPerTile: 32, maxSide: 3072 },
    cliffs: { pxPerTile: 32, maxSide: 3072 },
    lines: { pxPerTile: 48, maxSide: 3072 },
    objects: { iconFromPx: 16 },
  },
  high: {
    terrain: { pxPerTile: 64, maxSide: 4096 },
    cliffs: { pxPerTile: 64, maxSide: 4096 },
    lines: { pxPerTile: 64, maxSide: 4096 },
    objects: { iconFromPx: 16 },
  },
  // 8192 x 8192 is 256 MB for one canvas, and there are three: for machines with plenty of RAM and a good GPU.
  ultra: {
    terrain: { pxPerTile: 128, maxSide: 8192 },
    cliffs: { pxPerTile: 128, maxSide: 8192 },
    lines: { pxPerTile: 80, maxSide: 8192 },
    objects: { iconFromPx: 12 },
  },
}

/** Hard limits for the custom sliders: a canvas side over 16384 px is refused by the browser. */
export const DRAW_QUALITY_LIMITS = {
  pxPerTile: { min: 4, max: 256 },
  maxSide: { min: 1024, max: 16384 },
  iconFromPx: { min: 6, max: 48 },
} as const

export function resolveDrawQuality(choice: DrawQualityChoice | undefined, custom: DrawQuality | undefined): DrawQuality {
  if (choice === 'custom' && custom) return custom
  return DRAW_QUALITY_PRESETS[choice && choice !== 'custom' ? choice : 'high']
}

/** Pixels per tile a canvas layer gets on a map of this size: the ceiling, or less when the canvas would pass `maxSide`. */
export function layerPxPerTile(layer: CanvasLayerQuality, sizeX: number, sizeZ: number, floor = 4): number {
  return Math.max(floor, Math.min(layer.pxPerTile, Math.floor(layer.maxSide / Math.max(sizeX, sizeZ, 1))))
}

/** Memory of the three canvas layers on this map, in MB (RGBA, 4 bytes a pixel), for the settings panel. */
export function estimateCanvasMegabytes(quality: DrawQuality, sizeX: number, sizeZ: number): number {
  const layers = [quality.terrain, quality.cliffs, quality.lines]
  const bytes = layers.reduce((sum, layer) => {
    const px = layerPxPerTile(layer, sizeX, sizeZ)
    return sum + sizeX * px * sizeZ * px * 4
  }, 0)
  return Math.round(bytes / (1024 * 1024))
}
