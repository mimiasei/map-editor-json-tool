// ─── Water surface for the Map Grid ──────────────────────────────────────────
// In the game the water is a translucent plane lit by the sun: ripples bend the light, and a few tiny crests catch it as white glints.
// Here that is a tileable overlay baked once from the game's own `WaterNormal` (verified: 1024x1024, R is a constant 255, G holds the
// normal's y and A its x, both centred near 115 of 255, so it is the DXT5nm packing). No animation: the overlay stands still.

import { useEffect, useState } from 'react'
import { loadLayer } from './terrain-textures'

/** How many tiles one copy of the overlay spans (chosen by eye against a GME screenshot). */
export const WATER_SURFACE_REPEAT_TILES = 8

/** Opacity of the tint the water plane gets over the terrain (its colour per water type is in terrain-colors.ts), i.e. how much of the
 *  ground and cliff walls still shows through. */
export const WATER_SURFACE_ALPHA = 0.72

// Light from the upper right, as in GME's screenshot: a ripple facing it brightens, the one facing away darkens.
const LIGHT_X = 0.6
const LIGHT_Y = 0.8
/** Strength of the soft ripple shading at its strongest. */
const SHADE_ALPHA = 0.22
/** The glints: the same normals read at 3x the frequency are added, and only crests above GLINT_FROM (in standard deviations) show. */
const GLINT_FROM = 3.1
const GLINT_FULL = 3.8

/** Turns the raw WaterNormal pixels (RGBA, in place) into the overlay: soft light/dark ripples plus white glints. */
export function bakeWaterSurface(rgba: Uint8ClampedArray, size: number): void {
  const n = size * size
  const slope = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const nx = rgba[i * 4 + 3] - 115
    const ny = rgba[i * 4 + 1] - 115
    slope[i] = nx * LIGHT_X + ny * LIGHT_Y
    sum += slope[i]
  }
  const mean = sum / n
  let varSum = 0
  for (let i = 0; i < n; i++) varSum += (slope[i] - mean) ** 2
  const sd = Math.sqrt(varSum / n) || 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const s = (slope[i] - mean) / sd
      const fine = (slope[((y * 3 + 301) % size) * size + ((x * 3 + 137) % size)] - mean) / sd
      const crest = s + fine
      const o = i * 4
      if (crest > GLINT_FROM) {
        const a = Math.min(1, (crest - GLINT_FROM) / (GLINT_FULL - GLINT_FROM))
        rgba[o] = rgba[o + 1] = rgba[o + 2] = 255
        rgba[o + 3] = Math.round(255 * (0.35 + 0.65 * a))
      } else if (s > 0) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = 255
        rgba[o + 3] = Math.round(255 * Math.min(1, s / 2.5) * SHADE_ALPHA)
      } else {
        rgba[o] = 0
        rgba[o + 1] = 40
        rgba[o + 2] = 60
        rgba[o + 3] = Math.round(255 * Math.min(1, -s / 2.5) * SHADE_ALPHA)
      }
    }
  }
}

let loaded: HTMLCanvasElement | null = null

/** The baked overlay, or null until the texture is extracted (desktop build). */
export function useWaterSurface(): HTMLCanvasElement | null {
  const [surface, setSurface] = useState<HTMLCanvasElement | null>(loaded)
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      if (loaded) return
      void loadLayer('WaterNormal', true, (rgba) => bakeWaterSurface(rgba, 1024))
        .catch(() => null)
        .then((c) => {
          if (c) loaded = c
          if (!cancelled && c) setSurface(c)
        })
    }
    refresh()
    window.addEventListener('oe:thumbnails-extracted', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('oe:thumbnails-extracted', refresh)
    }
  }, [])
  return surface
}

/** A repeating pattern of the overlay on `ctx`, sized so one copy spans WATER_SURFACE_REPEAT_TILES tiles of `pxPerTile`. */
export function waterSurfacePattern(ctx: CanvasRenderingContext2D, surface: HTMLCanvasElement, pxPerTile: number): CanvasPattern | null {
  const pattern = ctx.createPattern(surface, 'repeat')
  pattern?.setTransform(new DOMMatrix().scale((pxPerTile * WATER_SURFACE_REPEAT_TILES) / surface.width))
  return pattern
}

/** How far the plane's own shore fade reaches into a water tile, as a share of the tile. */
const SHORE_REACH_TILES = 0.8
const SHORE_STEPS = 64
/** Share of the plane that is erased right at the shore (1 = fully see-through there). */
const SHORE_EDGE_ERASE = 4.0

/**
 * Fades the plane out toward land: along every water tile edge that meets land, nested strips erase the plane, most at the shore and
 * nothing at SHORE_REACH_TILES in, so the water thins out instead of ending in a hard line and the cliff pieces on the shore show.
 * Map borders are not shores.
 */
export function fadeWaterShore(ctx: CanvasRenderingContext2D, isWater: (node: number) => boolean, sizeX: number, sizeZ: number, pxPerTile: number): void {
  const strips = Array.from({ length: SHORE_STEPS }, () => new Path2D())
  const reach = SHORE_REACH_TILES * pxPerTile
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      if (!isWater(z * sizeX + x)) continue
      const left = x * pxPerTile
      const top = (sizeZ - 1 - z) * pxPerTile
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= sizeX || nz >= sizeZ || isWater(nz * sizeX + nx)) continue
        for (let step = 0; step < SHORE_STEPS; step++) {
          const w = (reach * (SHORE_STEPS - step)) / SHORE_STEPS
          if (dx === -1) strips[step].rect(left, top, w, pxPerTile)
          else if (dx === 1) strips[step].rect(left + pxPerTile - w, top, w, pxPerTile)
          else if (dz === 1) strips[step].rect(left, top, pxPerTile, w)
          else strips[step].rect(left, top + pxPerTile - w, pxPerTile, w)
        }
      }
    }
  }
  // Strip 0 is the widest: alone it sets the opacity left at the far end, each narrower one adds what is still missing.
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  let passed = 1
  strips.forEach((path, step) => {
    const left = 1 - (SHORE_EDGE_ERASE * (step + 1)) / SHORE_STEPS
    ctx.globalAlpha = 1 - left / passed
    passed = left
    ctx.fill(path)
  })
  ctx.restore()
}
