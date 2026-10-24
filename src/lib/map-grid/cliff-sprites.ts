// ─── Rendered cliff pieces, loaded for the Map Grid ──────────────────────────
// The sidecar's "cliffs" render job (lib/object-render) writes renders/cliff_*.png next to the object renders, and for each a _m.png mask
// of its upward-facing surfaces (where the grid paints the biome's ground texture). This loads them once and hands them to the grid; with
// none rendered the maps are empty and the grid keeps its flat elevation tint only.

import { useEffect, useState } from 'react'
import { CLIFF_TAG } from '@/lib/object-render/canvas-size'
import { appDataDir } from '@/lib/object-render/render-index'
import { useObjectRenderStore } from '@/store/useObjectRenderStore'

export interface CliffSprites {
  sprites: ReadonlyMap<string, HTMLImageElement>
  /** Top-surface masks by the same sid. */
  masks: ReadonlyMap<string, HTMLImageElement>
}

const loaded = new Map<string, HTMLImageElement>()
const loadedMasks = new Map<string, HTMLImageElement>()

/**
 * Read through the fs plugin into a blob URL: the grid reads pixels of these (it tints the rock), and a canvas holding an asset:// image
 * is cross-origin and refuses getImageData.
 */
async function loadFile(path: string): Promise<HTMLImageElement | null> {
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const url = URL.createObjectURL(new Blob([await readFile(path)], { type: 'image/png' }))
    const img = await loadImage(url)
    URL.revokeObjectURL(url)
    return img
  } catch {
    return null
  }
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Cliff sprites by render sid; replaced by a new object when more arrive, so it can sit in effect deps. */
export function useCliffSprites(): CliffSprites {
  const index = useObjectRenderStore((s) => s.index)
  const [sprites, setSprites] = useState<CliffSprites>(() => ({ sprites: new Map(loaded), masks: new Map(loadedMasks) }))
  useEffect(() => {
    if (!index) return
    const wanted = Object.keys(index.objects).filter((sid) => sid.startsWith('cliff_') && sid.endsWith(`_${CLIFF_TAG}`) && !loaded.has(sid))
    if (wanted.length === 0) return
    let cancelled = false
    void appDataDir().then((dir) => Promise.all(wanted.map(async (sid) => {
      const [img, mask] = await Promise.all([loadFile(`${dir}renders/${sid}.png`), loadFile(`${dir}renders/${sid}_m.png`)])
      if (img) loaded.set(sid, img)
      if (mask) loadedMasks.set(sid, mask)
    }))).then(() => {
      if (!cancelled) setSprites({ sprites: new Map(loaded), masks: new Map(loadedMasks) })
    })
    return () => { cancelled = true }
  }, [index])
  return sprites
}
