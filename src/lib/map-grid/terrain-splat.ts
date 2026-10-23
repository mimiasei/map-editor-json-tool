// ─── Splat-map blending of ground layers ─────────────────────────────────────
// The game builds its ground from a few tiling layer textures mixed through an RGBA splat map (`splat_map1`; materials
// such as `humanbase_mt` list the layers as `_Texture0..3`). This is that mix on plain pixel buffers, kept free of the
// DOM so it can be run on raw RGBA data.

/** One layer laid over the base: where the splat map's `channel` (0 R, 1 G, 2 B) is high, the layer shows. */
export interface SplatLayerPixels {
  rgba: Uint8ClampedArray
  channel: 0 | 1 | 2
}

/**
 * `base` first, then each layer in order, weighted by its splat channel times its own alpha (grass1 and
 * autumn_ground4 have transparent holes: they are overlays, not full textures). All buffers are RGBA of the same size.
 */
export function compositeSplat(base: Uint8ClampedArray, layers: SplatLayerPixels[], splat: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(base.length)
  for (let i = 0; i < base.length; i += 4) {
    let r = base[i], g = base[i + 1], b = base[i + 2]
    for (const layer of layers) {
      const a = (layer.rgba[i + 3] / 255) * (splat[i + layer.channel] / 255)
      if (a <= 0) continue
      r += (layer.rgba[i] - r) * a
      g += (layer.rgba[i + 1] - g) * a
      b += (layer.rgba[i + 2] - b) * a
    }
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = 255
  }
  return out
}
