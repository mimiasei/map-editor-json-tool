// ─── Textures for roads and rivers on the Map Grid ───────────────────────────
// The game draws roads and rivers with shaders, so there is no road texture as such; these are the closest ground textures it ships:
// the cobble of its stone road (`nature_road`, also the road layer of the autumn terrain material), a brown dirt for the dirt road and the
// tiling water texture. Extracted next to the terrain layers; with none extracted the grid keeps its flat colours.

import { useEffect, useState } from 'react'
import { loadLayer } from './terrain-textures'

export type LineTextureKey = 'stone' | 'dirt' | 'water'

const SOURCE: Record<LineTextureKey, string> = { stone: 'nature_road', dirt: 'dirt_ground2', water: 'WaterTexture' }

const loaded = new Map<LineTextureKey, HTMLCanvasElement>()

export function useLineTextures(): ReadonlyMap<LineTextureKey, HTMLCanvasElement> {
  const [textures, setTextures] = useState<ReadonlyMap<LineTextureKey, HTMLCanvasElement>>(() => new Map(loaded))
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void Promise.all((Object.keys(SOURCE) as LineTextureKey[]).map(async (key) => {
        if (loaded.has(key)) return
        const img = await loadLayer(SOURCE[key]).catch(() => null)
        if (img) loaded.set(key, img)
      })).then(() => {
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
