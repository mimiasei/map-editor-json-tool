// ─── Rendered cliff pieces, loaded for the Map Grid ──────────────────────────
// The sidecar's "cliffs" render job (lib/object-render) writes renders/cliff_*.png next to the object renders. This loads the images
// once and hands them to the grid; with none rendered the map is empty and the grid keeps its flat elevation tint only.

import { useEffect, useState } from 'react'
import { objectRender } from '@/lib/object-render/render-index'
import { useObjectRenderStore } from '@/store/useObjectRenderStore'

const loaded = new Map<string, HTMLImageElement>()

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Cliff sprites by render sid; replaced by a new map when more arrive, so it can sit in effect deps. */
export function useCliffSprites(): ReadonlyMap<string, HTMLImageElement> {
  const index = useObjectRenderStore((s) => s.index)
  const [sprites, setSprites] = useState<ReadonlyMap<string, HTMLImageElement>>(() => new Map(loaded))
  useEffect(() => {
    if (!index) return
    const wanted = Object.keys(index.objects).filter((sid) => sid.startsWith('cliff_') && !loaded.has(sid))
    if (wanted.length === 0) return
    let cancelled = false
    void Promise.all(wanted.map(async (sid) => {
      const render = objectRender(sid)
      const img = render ? await loadImage(render.src) : null
      if (img) loaded.set(sid, img)
    })).then(() => {
      if (!cancelled) setSprites(new Map(loaded))
    })
    return () => { cancelled = true }
  }, [index])
  return sprites
}
