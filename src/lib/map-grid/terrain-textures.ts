// ─── Map Grid ground textures ────────────────────────────────────────────────
// The game's own per-biome ground art (`minimap_<biome>_biom`, 1024x1024), extracted next to the
// thumbnails by the sidecar (see BIOME_TEXTURE_ICONS). Laid under the flat terrain colours and shown
// through them by the "Terrain texture" setting. Desktop build only: with nothing extracted every
// helper here reports "no textures" and the grid keeps its flat colours.

import { useEffect, useState } from 'react'
import { BIOME_TEXTURE_ICONS } from '@/lib/catalog/icon-requests'
import { compositeSplat } from './terrain-splat'
import { thumbnailFilePath, thumbnailPath } from '@/lib/catalog/thumbnails'
import { isBiomeId } from './terrain-colors'

export type TextureKey = keyof typeof BIOME_TEXTURE_ICONS

/** How many tiles one copy of a single-image texture spans. The game's own scale is not known; chosen by eye. */
export const TEXTURE_REPEAT_TILES = 12

/** The same for a blended biome: one copy of the splat map. */
export const SPLAT_REPEAT_TILES = 24

/**
 * How many tiles one copy of a layer texture (512 px) spans inside a blended texture. Measured on GME screenshots with objects
 * that fill exactly one tile: a grass tuft is about a quarter tile, which puts a 512 px layer at about 3 tiles. The splat blobs
 * are 2-3 tiles across, which fits one splat map spanning about SPLAT_REPEAT_TILES.
 */
const LAYER_TILES = 3

/** Canvas pixels per tile for the texture layer, capped so the canvas stays at most ~3072 px on a side. */
export function textureScale(sizeX: number, sizeZ: number): number {
  return Math.max(4, Math.min(32, Math.floor(3072 / Math.max(sizeX, sizeZ, 1))))
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

/**
 * Biomes the game builds from layers over a splat map (see terrain-splat.ts). `channel` is which splat colour brings a layer in.
 * Layer names are from the game's materials (humanbase_mt: grass2, grass1, grass3, dirt_ground3; battle_autumn_mt: autumn_ground4,
 * _1, _2); which channel drives which layer is NOT known from the data, so this assignment is by eye. A biome without a recipe
 * (or with a layer not extracted) uses its single minimap texture.
 */
const TERRAIN_RECIPES: Partial<Record<TextureKey, { base: string; layers: { name: string; channel: 0 | 1 | 2 }[] }>> = {
  1: { base: 'grass2', layers: [{ name: 'grass3', channel: 0 }, { name: 'grass1', channel: 1 }, { name: 'grass_dirt', channel: 2 }] },
  5: { base: 'autumn_ground1', layers: [{ name: 'autumn_ground4', channel: 1 }, { name: 'autumn_ground2', channel: 2 }] },
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

/** Pixels of an image drawn `copies` x `copies` times over a size x size canvas. */
function pixelsOf(img: HTMLImageElement, size: number, copies: number): Uint8ClampedArray | null {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const w = size / copies
  for (let y = 0; y < size; y += w) for (let x = 0; x < size; x += w) ctx.drawImage(img, x, y, w, w)
  return ctx.getImageData(0, 0, size, size).data
}

/**
 * Read through the fs plugin into a blob URL: pixels of an asset:// image cannot be read back from a canvas (cross-origin),
 * and the blend needs them.
 */
async function loadNamed(name: string): Promise<HTMLImageElement | null> {
  const path = thumbnailFilePath(name)
  if (!path) return null
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const url = URL.createObjectURL(new Blob([await readFile(path)], { type: 'image/png' }))
  const img = await loadImage(url)
  URL.revokeObjectURL(url)
  return img
}

/** The biome's layers blended through the splat map, or null when any of them is not extracted. */
async function blendBiome(key: TextureKey): Promise<HTMLCanvasElement | null> {
  const recipe = TERRAIN_RECIPES[key]
  if (!recipe) return null
  const [splat, base, ...layers] = await Promise.all([
    loadNamed('splat_map1'), loadNamed(recipe.base), ...recipe.layers.map((l) => loadNamed(l.name)),
  ])
  if (!splat || !base || layers.some((l) => !l)) return null
  const copies = Math.max(1, Math.round(SPLAT_REPEAT_TILES / LAYER_TILES))
  const splatPx = pixelsOf(splat, BLEND_SIZE, 1)
  const basePx = pixelsOf(base, BLEND_SIZE, copies)
  const layerPx = layers.map((l, i) => ({ rgba: pixelsOf(l!, BLEND_SIZE, copies), channel: recipe.layers[i].channel }))
  if (!splatPx || !basePx || layerPx.some((l) => !l.rgba)) return null
  const out = compositeSplat(basePx, layerPx as { rgba: Uint8ClampedArray; channel: 0 | 1 | 2 }[], splatPx)
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
