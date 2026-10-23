// ─── Map Grid ground textures ────────────────────────────────────────────────
// The game's own per-biome ground art (`minimap_<biome>_biom`, 1024x1024), extracted next to the
// thumbnails by the sidecar (see BIOME_TEXTURE_ICONS). Laid under the flat terrain colours and shown
// through them by the "Terrain texture" setting. Desktop build only: with nothing extracted every
// helper here reports "no textures" and the grid keeps its flat colours.

import { useEffect, useState } from 'react'
import { BIOME_TEXTURE_ICONS } from '@/lib/catalog/icon-requests'
import { thumbnailPath } from '@/lib/catalog/thumbnails'
import { isBiomeId } from './terrain-colors'

export type TextureKey = keyof typeof BIOME_TEXTURE_ICONS

/** How many tiles one copy of a texture spans. The game's own scale is not known; chosen by eye. */
export const TEXTURE_REPEAT_TILES = 16

/** Canvas pixels per tile for the texture layer, capped so the canvas stays at most ~3072 px on a side. */
export function textureScale(sizeX: number, sizeZ: number): number {
  return Math.max(4, Math.min(16, Math.floor(3072 / Math.max(sizeX, sizeZ, 1))))
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

const loaded = new Map<TextureKey, HTMLImageElement>()

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

async function loadAll(): Promise<void> {
  // Object.keys gives the biome ids as strings; the tiles look them up as numbers.
  for (const name of Object.keys(BIOME_TEXTURE_ICONS)) {
    const key: TextureKey = name === 'water' ? 'water' : (Number(name) as TextureKey)
    if (loaded.has(key)) continue
    const url = thumbnailPath(BIOME_TEXTURE_ICONS[key])
    if (!url) continue
    const img = await loadImage(url)
    if (img) loaded.set(key, img)
  }
}

/** Loaded textures; the map is replaced when more arrive (also after a fresh extraction), so it can sit in effect deps. */
export function useBiomeTextures(): ReadonlyMap<TextureKey, HTMLImageElement> {
  const [textures, setTextures] = useState<ReadonlyMap<TextureKey, HTMLImageElement>>(() => new Map(loaded))
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
 * One repeating pattern per texture, sized so a copy spans TEXTURE_REPEAT_TILES tiles at `scale` px/tile. Each
 * pattern tile is the texture mirrored 2x2: opposite edges of the originals differ by a few grey levels (checked on
 * the extracted files), which shows as a seam in a plain repeat; mirroring makes every join match.
 */
export function buildTexturePatterns(
  ctx: CanvasRenderingContext2D,
  textures: ReadonlyMap<TextureKey, HTMLImageElement>,
  scale: number,
): Map<TextureKey, CanvasPattern> {
  const half = TEXTURE_REPEAT_TILES * scale
  const patterns = new Map<TextureKey, CanvasPattern>()
  for (const [key, img] of textures) {
    const tile = document.createElement('canvas')
    tile.width = tile.height = half * 2
    const t = tile.getContext('2d')
    if (!t) continue
    for (const [qx, qz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      // Quadrant (qx, qz) holds the image mirrored in x and/or z around the quadrant's centre.
      t.setTransform(qx ? -1 : 1, 0, 0, qz ? -1 : 1, qx * half + half / 2, qz * half + half / 2)
      t.drawImage(img, -half / 2, -half / 2, half, half)
    }
    const pattern = ctx.createPattern(tile, 'repeat')
    if (pattern) patterns.set(key, pattern)
  }
  return patterns
}
