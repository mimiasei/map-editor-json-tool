// ─── Rivers from the game's own river pieces ──────────────────────────────────
// The game builds a river from one mesh per tile, chosen by which of the four neighbours it connects to (objects/test/rivers/rivers):
// river_AB a turn, river_ABD a T, river_ABCD a cross, river_point an end and three straights (river_AC, .001, .002), each a bank with
// pebbles and stones round a channel, plus a water sheet. The sidecar's "rivers" render job draws each piece from straight above in all
// four turns (mesh_export.py); this picks the render for a tile's connections. Which edges each render's water reaches was measured
// from the renders themselves (water pixels touching each tile edge), not read from the piece names.

import { useEffect, useState } from 'react'
import { RIVER_TAG } from '@/lib/object-render/canvas-size'
import { appDataDir, RENDER_PX_PER_TILE } from '@/lib/object-render/render-index'
import { useObjectRenderStore } from '@/store/useObjectRenderStore'
import { loadFile } from './cliff-sprites'

/** Connection bits, as in the map's river nodes: east 1, west 2, north 4, south 8. */
const PIECES: Record<number, string[]> = {
  1: ['point_r0'], 4: ['point_r90'], 2: ['point_r180'], 8: ['point_r270'],
  3: ['AC0_r0', 'AC0_r180', 'AC1_r0', 'AC1_r180', 'AC2_r0', 'AC2_r180'],
  12: ['AC0_r90', 'AC0_r270', 'AC1_r90', 'AC1_r270', 'AC2_r90', 'AC2_r270'],
  6: ['AB_r0'], 10: ['AB_r90'], 9: ['AB_r180'], 5: ['AB_r270'],
  11: ['ABD_r0'], 13: ['ABD_r90'], 7: ['ABD_r180'], 14: ['ABD_r270'],
  15: ['ABCD_r0', 'ABCD_r90', 'ABCD_r180', 'ABCD_r270'],
}

/** The render sid for a tile with these connections; a tile with none gets an end piece, so it still shows. */
export function riverSid(mask: number, node: number): string {
  const options = PIECES[mask] ?? PIECES[1]
  // Stable per tile, so a piece does not change when the map is repainted elsewhere.
  const h = Math.imul(node + 1, 0x9e3779b1) >>> 7
  return `river_${options[h % options.length]}_${RIVER_TAG}`
}

const loaded = new Map<string, HTMLCanvasElement>()

/**
 * The renders are bright and warm next to the game's own river banks; the water (blue) is left as it is, except that it is made fully
 * opaque within 3 px of the tile's border: the half-covered edge pixels of two neighbouring pieces would add up to a lighter seam.
 */
function mute(img: HTMLImageElement, ox: number, oy: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const g = c.getContext('2d')
  if (!g) return null
  g.drawImage(img, 0, 0)
  const px = g.getImageData(0, 0, c.width, c.height)
  const left = ox - RENDER_PX_PER_TILE / 2
  const top = oy - RENDER_PX_PER_TILE / 2
  for (let i = 0; i < px.data.length; i += 4) {
    if (px.data[i + 2] > px.data[i] + 25) {
      const x = (i / 4) % c.width - left
      const y = Math.floor(i / 4 / c.width) - top
      const edge = Math.min(x, y, RENDER_PX_PER_TILE - 1 - x, RENDER_PX_PER_TILE - 1 - y)
      if (edge < 3 && edge >= 0 && px.data[i + 3] > 60) px.data[i + 3] = 255
      continue
    }
    px.data[i] *= 0.8
    px.data[i + 1] *= 0.74
    px.data[i + 2] *= 0.68
  }
  g.putImageData(px, 0, 0)
  return c
}

/** River renders by sid, replaced by a new map when more arrive, so it can sit in effect deps. */
export function useRiverSprites(): ReadonlyMap<string, HTMLCanvasElement> {
  const index = useObjectRenderStore((s) => s.index)
  const [sprites, setSprites] = useState<ReadonlyMap<string, HTMLCanvasElement>>(() => new Map(loaded))
  useEffect(() => {
    if (!index) return
    const wanted = Object.keys(index.objects).filter((sid) => sid.startsWith('river_') && sid.endsWith(`_${RIVER_TAG}`) && !loaded.has(sid))
    if (wanted.length === 0) return
    let cancelled = false
    void appDataDir().then((dir) => Promise.all(wanted.map(async (sid) => {
      const img = await loadFile(`${dir}renders/${sid}.png`)
      const entry = index.objects[sid]
      const c = img ? mute(img, entry.ox, entry.oy) : null
      if (c) loaded.set(sid, c)
    }))).then(() => {
      if (!cancelled) setSprites(new Map(loaded))
    })
    return () => { cancelled = true }
  }, [index])
  return sprites
}
