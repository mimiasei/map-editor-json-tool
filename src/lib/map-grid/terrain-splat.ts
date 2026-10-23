// ─── Splat-map blending of ground layers ─────────────────────────────────────
// The game builds its ground from a few tiling layer textures mixed by blend weights. Here `splat_map1` (a 2048x2048 RGBA
// texture in the game data) stands in for those weights. This is that mix on plain pixel buffers, kept free of the DOM so it
// can be run on raw RGBA data.

/** One layer laid over the base: where the splat map's `channel` (0 R, 1 G, 2 B) lies between `lo` and `hi`, the layer fades in. */
export interface SplatLayerPixels {
  rgba: Uint8ClampedArray
  channel: 0 | 1 | 2
  lo: number
  hi: number
  /** Pure black pixels are holes (grass1, autumn_ground4, lava_blank ship with black where there is no art). */
  cutout?: boolean
}

function smoothstep(lo: number, hi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/**
 * `base` first, then each layer in order, then `tint` (per-channel multiplier). All buffers are RGBA of the same size; the
 * layers' alpha is ignored, because in the game's ground textures it is a height map, not coverage.
 */
export function compositeSplat(
  base: Uint8ClampedArray,
  layers: SplatLayerPixels[],
  splat: Uint8ClampedArray,
  tint: readonly [number, number, number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base.length)
  for (let i = 0; i < base.length; i += 4) {
    let r = base[i], g = base[i + 1], b = base[i + 2]
    for (const layer of layers) {
      const px = layer.rgba
      if (layer.cutout && px[i] + px[i + 1] + px[i + 2] <= 6) continue
      const a = smoothstep(layer.lo, layer.hi, splat[i + layer.channel] / 255)
      if (a <= 0) continue
      r += (px[i] - r) * a
      g += (px[i + 1] - g) * a
      b += (px[i + 2] - b) * a
    }
    out[i] = r * tint[0]
    out[i + 1] = g * tint[1]
    out[i + 2] = b * tint[2]
    out[i + 3] = 255
  }
  return out
}
