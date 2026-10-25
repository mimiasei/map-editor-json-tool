// ─── Map Grid ground textures ────────────────────────────────────────────────
// The game's own per-biome ground art (`minimap_<biome>_biom`, 1024x1024), extracted next to the
// thumbnails by the sidecar (see BIOME_TEXTURE_ICONS). Laid under the flat terrain colours and shown
// through them by the "Terrain texture" setting. Desktop build only: with nothing extracted every
// helper here reports "no textures" and the grid keeps its flat colours.

import { useEffect, useState } from 'react'
import { BIOME_TEXTURE_ICONS } from '@/lib/catalog/icon-requests'
import { compositeSplat, type SplatLayerPixels } from './terrain-splat'
import { decodePng } from '@/lib/png-decode'
import { thumbnailFilePath, thumbnailPath } from '@/lib/catalog/thumbnails'
import { isBiomeId } from './terrain-colors'
import { DRAW_QUALITY_PRESETS, layerPxPerTile, type CanvasLayerQuality } from './draw-quality'

export type TextureKey = keyof typeof BIOME_TEXTURE_ICONS

/** How many tiles one copy of a single-image texture spans. The game's own scale is not known; chosen by eye. */
export const TEXTURE_REPEAT_TILES = 12

/** The same for a blended biome: one copy of the splat map. */
export const SPLAT_REPEAT_TILES = 24

/** Canvas pixels per tile for the texture layer (and the cliffs), within the chosen draw quality (draw-quality.ts). */
export function textureScale(sizeX: number, sizeZ: number, layer: CanvasLayerQuality = DRAW_QUALITY_PRESETS.high.terrain): number {
  return layerPxPerTile(layer, sizeX, sizeZ)
}

/** True when the textures have been extracted (manifest knows them). */
export function biomeTexturesAvailable(): boolean {
  return thumbnailPath(BIOME_TEXTURE_ICONS[1]) !== null
}

// Land-to-land biome borders fade: along each tile edge that meets another biome, that biome's texture is laid over the tile in
// steps of falling opacity. The widths and opacities are chosen by eye; the game itself blends through a splat map.
/** How far the neighbour's texture reaches into the tile, as a share of the tile. */
export const BIOME_FADE_TILES = 0.4
/** Opacity of the neighbour's texture right at the border (0.5 = an even mix with the tile's own texture there). */
export const BIOME_FADE_EDGE_OPACITY = 0.5
const BIOME_FADE_STEPS = 6

/**
 * Draws the fade strips over a texture canvas already filled tile by tile. `keys` is each node's texture key; water and unknown ground
 * take no part. Strips of one neighbour texture and one step share a path, so a map costs a few fills, not one per edge.
 */
export function drawBiomeEdgeFade(
  ctx: CanvasRenderingContext2D,
  patterns: ReadonlyMap<TextureKey, CanvasPattern>,
  keys: readonly (TextureKey | null)[],
  sizeX: number,
  sizeZ: number,
  scale: number,
): void {
  const reach = BIOME_FADE_TILES * scale
  // Opacities per nested strip so that the opacities stack up to the edge value at the border and fall to nothing inside.
  const total = BIOME_FADE_EDGE_OPACITY
  const stepAlpha = 1 - Math.pow(1 - total, 1 / BIOME_FADE_STEPS)
  const paths = new Map<TextureKey, Path2D[]>()
  const pathFor = (key: TextureKey, step: number): Path2D => {
    let list = paths.get(key)
    if (!list) paths.set(key, (list = Array.from({ length: BIOME_FADE_STEPS }, () => new Path2D())))
    return list[step]
  }
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const here = keys[z * sizeX + x]
      if (typeof here !== 'number') continue
      const left = x * scale
      const top = (sizeZ - 1 - z) * scale
      // Neighbours as [dx, dz]; dz = +1 is the canvas row above.
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= sizeX || nz >= sizeZ) continue
        const there = keys[nz * sizeX + nx]
        if (typeof there !== 'number' || there === here || !patterns.has(there)) continue
        for (let step = 0; step < BIOME_FADE_STEPS; step++) {
          const w = (reach * (BIOME_FADE_STEPS - step)) / BIOME_FADE_STEPS
          const path = pathFor(there, step)
          if (dx === -1) path.rect(left, top, w, scale)
          else if (dx === 1) path.rect(left + scale - w, top, w, scale)
          else if (dz === 1) path.rect(left, top, scale, w)
          else path.rect(left, top + scale - w, scale, w)
        }
      }
    }
  }
  ctx.save()
  ctx.globalAlpha = stepAlpha
  for (const [key, list] of paths) {
    ctx.fillStyle = patterns.get(key)!
    for (const path of list) ctx.fill(path)
  }
  ctx.restore()
}

/** Texture key of one tile: water wins over the biome, same rule as terrainFillColor. */
export function textureKeyFor(tileId: number | undefined, waterId: number | undefined): TextureKey | null {
  if (waterId) return 'water'
  return tileId !== undefined && isBiomeId(tileId) ? tileId : null
}

/** What a pattern is cut from: the game's own image, or a canvas where layers were blended through the splat map. */
export type TextureSource = HTMLImageElement | HTMLCanvasElement

interface SplatRecipe {
  /** Copies of each 512 px layer across one splat map (SPLAT_REPEAT_TILES tiles): feature size per tile. */
  copies: number
  base: string
  layers: { name: string; channel: 0 | 1 | 2; lo: number; hi: number; cutout?: boolean }[]
  /** Per-channel multiplier toward the game's lit colour. */
  tint: [number, number, number]
}

/**
 * How each biome is built from the game's ground layers, fitted by eye and by average colour to GME screenshots (a flat
 * map with two objects that fill exactly one tile, so the scale is known). Layer names come from the game's terrain materials
 * (humanbase_mt, battle_*_mt, ...); which splat channel drives which layer, the thresholds (lo/hi, set so each layer covers
 * about the share of ground seen in the screenshot) and `copies` are NOT in the game data. A biome without a recipe (or
 * with a layer not extracted) uses its single minimap texture.
 */
const TERRAIN_RECIPES: Partial<Record<TextureKey, SplatRecipe>> = {
  1: { copies: 6, base: 'grass2', tint: [1, 0.94, 0.97], layers: [
    { name: 'grass1', channel: 0, lo: 0.38, hi: 0.52, cutout: true },
    { name: 'grass_dirt', channel: 2, lo: 0.25, hi: 0.37 },
  ] },
  2: { copies: 6, base: 'sand2', tint: [1, 0.94, 0.93], layers: [
    { name: 'sand3', channel: 2, lo: 0.14, hi: 0.26 },
  ] },
  3: { copies: 12, base: 'dead_ground1', tint: [1.06, 0.97, 0.98], layers: [
    { name: 'dead_grass2', channel: 0, lo: 0.58, hi: 0.7 },
    { name: 'dead_ground2', channel: 1, lo: 0.44, hi: 0.56 },
  ] },
  4: { copies: 5, base: 'snow2', tint: [1, 0.94, 0.96], layers: [
    { name: 'snow4', channel: 1, lo: 0.4, hi: 0.5 },
  ] },
  5: { copies: 6, base: 'autumn_ground1', tint: [1.02, 0.94, 0.97], layers: [
    { name: 'autumn_ground4', channel: 1, lo: 0.31, hi: 0.43, cutout: true },
    { name: 'autumn_ground2', channel: 2, lo: 0.16, hi: 0.28, cutout: true },
  ] },
  // lava_blank has black holes, so lava_cracks lies under it; lo -1 / hi 0 makes it cover everything that is not a hole.
  6: { copies: 8, base: 'lava_cracks', tint: [1.04, 0.97, 0.99], layers: [
    { name: 'lava_blank', channel: 0, lo: -1, hi: 0, cutout: true },
    { name: 'lava_glowy', channel: 2, lo: 0.27, hi: 0.37 },
  ] },
  7: { copies: 8, base: 'dirt_ground3', tint: [1.03, 0.96, 0.99], layers: [
    { name: 'dirt_ground2', channel: 0, lo: 0.6, hi: 0.72 },
    { name: 'dirt_ground1', channel: 2, lo: 0.2, hi: 0.32 },
  ] },
}

/** Side of a blended texture in px; the layers are tiled inside it. */
const BLEND_SIZE = 1024

const loaded = new Map<TextureKey, TextureSource>()

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Pixels of a canvas drawn `copies` x `copies` times over a size x size canvas, optionally blurred (CSS px of that canvas). */
function pixelsOf(img: HTMLCanvasElement, size: number, copies: number, blur = 0): Uint8ClampedArray | null {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  if (blur) ctx.filter = `blur(${blur}px)`
  const w = size / copies
  for (let y = 0; y < size; y += w) for (let x = 0; x < size; x += w) ctx.drawImage(img, x, y, w, w)
  return ctx.getImageData(0, 0, size, size).data
}

/**
 * An extracted texture as an opaque canvas. Read through the fs plugin and decoded by hand: pixels of an asset:// image cannot
 * be read back from a canvas (cross-origin), and a canvas would premultiply the colour by the height map in alpha.
 * `bake` gets the raw RGBA (alpha kept) to fold the height map into the colour itself; the result keeps whatever alpha it sets.
 */
export async function loadLayer(name: string, keepAlpha = false, bake?: (rgba: Uint8ClampedArray) => void): Promise<HTMLCanvasElement | null> {
  const path = thumbnailFilePath(name)
  if (!path) return null
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const { width, height, rgba } = await decodePng(await readFile(path), keepAlpha || !!bake)
  bake?.(rgba)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  c.getContext('2d')?.putImageData(new ImageData(rgba, width, height), 0, 0)
  return c
}

/** The biome's layers blended through the splat map, or null when any of them is not extracted. */
async function blendBiome(key: TextureKey): Promise<HTMLCanvasElement | null> {
  const recipe = TERRAIN_RECIPES[key]
  if (!recipe) return null
  const [splat, base, ...layers] = await Promise.all([
    loadLayer('splat_map1'), loadLayer(recipe.base), ...recipe.layers.map((l) => loadLayer(l.name)),
  ])
  if (!splat || !base || layers.some((l) => !l)) return null
  // Soft blobs: the raw splat map is grainier than the game's ground (blur 8 px at 2048 px = 4 px at BLEND_SIZE).
  const splatPx = pixelsOf(splat, BLEND_SIZE, 1, 4)
  const basePx = pixelsOf(base, BLEND_SIZE, recipe.copies)
  const layerPx = recipe.layers.map((l, i) => ({ ...l, rgba: pixelsOf(layers[i]!, BLEND_SIZE, recipe.copies) }))
  if (!splatPx || !basePx || layerPx.some((l) => !l.rgba)) return null
  const out = compositeSplat(basePx, layerPx as SplatLayerPixels[], splatPx, recipe.tint)
  const c = document.createElement('canvas')
  c.width = c.height = BLEND_SIZE
  c.getContext('2d')?.putImageData(new ImageData(out, BLEND_SIZE, BLEND_SIZE), 0, 0)
  return c
}

async function loadAll(): Promise<void> {
  // Object.keys gives the biome ids as strings; the tiles look them up as numbers.
  for (const name of Object.keys(BIOME_TEXTURE_ICONS)) {
    const key: TextureKey = name === 'water' ? 'water' : (Number(name) as TextureKey)
    if (loaded.has(key)) continue
    const blended = await blendBiome(key).catch((e) => { console.warn('terrain blend failed, using the minimap texture', e); return null })
    if (blended) { loaded.set(key, blended); continue }
    const url = thumbnailPath(BIOME_TEXTURE_ICONS[key])
    const img = url ? await loadImage(url) : null
    if (img) loaded.set(key, img)
  }
}

/** Loaded textures; the map is replaced when more arrive (also after a fresh extraction), so it can sit in effect deps. */
export function useBiomeTextures(): ReadonlyMap<TextureKey, TextureSource> {
  const [textures, setTextures] = useState<ReadonlyMap<TextureKey, TextureSource>>(() => new Map(loaded))
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void loadAll().then(() => {
        if (!cancelled) setTextures(new Map(loaded))
      })
    }
    refresh()
    window.addEventListener('oe:thumbnails-extracted', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('oe:thumbnails-extracted', refresh)
    }
  }, [])
  return textures
}

/**
 * One repeating pattern per texture, sized so a copy spans TEXTURE_REPEAT_TILES (SPLAT_REPEAT_TILES for a blend) tiles at `scale` px/tile. A plain repeat:
 * opposite edges of the minimap originals differ by a few grey levels (checked on the extracted files), so a faint seam can
 * show; mirroring 2x2 hid that but made a visible symmetry (see git history for it).
 */
export function buildTexturePatterns(
  ctx: CanvasRenderingContext2D,
  textures: ReadonlyMap<TextureKey, TextureSource>,
  scale: number,
): Map<TextureKey, CanvasPattern> {
  const patterns = new Map<TextureKey, CanvasPattern>()
  for (const [key, img] of textures) {
    const size = (img instanceof HTMLCanvasElement ? SPLAT_REPEAT_TILES : TEXTURE_REPEAT_TILES) * scale
    const tile = document.createElement('canvas')
    tile.width = tile.height = size
    const t = tile.getContext('2d')
    if (!t) continue
    t.drawImage(img, 0, 0, size, size)
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) patterns.set(key, pattern)
  }
  return patterns
}
