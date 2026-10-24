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

export type TextureKey = keyof typeof BIOME_TEXTURE_ICONS

/** How many tiles one copy of a single-image texture spans. The game's own scale is not known; chosen by eye. */
export const TEXTURE_REPEAT_TILES = 12

/** The same for a blended biome: one copy of the splat map. */
export const SPLAT_REPEAT_TILES = 24

/** Canvas pixels per tile for the texture layer, capped so the canvas stays at most ~3072 px on a side. */
export function textureScale(sizeX: number, sizeZ: number): number {
  return Math.max(4, Math.min(64, Math.floor(4096 / Math.max(sizeX, sizeZ, 1))))
}

/** True when the textures have been extracted (manifest knows them). */
export function biomeTexturesAvailable(): boolean {
  return thumbnailPath(BIOME_TEXTURE_ICONS[1]) !== null
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
 */
async function loadLayer(name: string): Promise<HTMLCanvasElement | null> {
  const path = thumbnailFilePath(name)
  if (!path) return null
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const { width, height, rgba } = await decodePng(await readFile(path))
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
