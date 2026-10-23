// Where a rendered object image sits on the Map Grid. The render is a 3/4 view of the prefab (see render-core.ts), so it
// is drawn at the grid's scale around the prefab's origin, not stretched to the footprint: tall buildings rise above
// their tiles. The origin lies at the centre of the object's anchor tile plus the template's offsetX/offsetZ.
//
// Assumption, checked on mine_gold only (its 2x2 building sits on the origin when drawn this way): offsetZ shifts toward
// the bottom of the screen, the same direction a footprint's rows extend (footprint.ts: Z extends backward).

import { RENDER_PX_PER_TILE, type ObjectRender } from '@/lib/object-render/render-index'

export interface RenderBox {
  left: number
  top: number
  width: number
  height: number
}

/** The image's box in grid px, relative to the top-left corner of the anchor tile; `cell` is the tile size in grid px. */
export function renderBoxFromAnchorTile(render: ObjectRender, cell: number): RenderBox {
  const scale = cell / RENDER_PX_PER_TILE
  return {
    left: cell / 2 + render.dx * cell - render.ox * scale,
    top: cell / 2 + render.dz * cell - render.oy * scale,
    width: render.w * scale,
    height: render.h * scale,
  }
}
