// An object drawn from its render (see lib/object-render). Positioned absolutely inside the grid cell box it belongs to,
// and allowed to spill out of it: renders are 3/4 views, so tall objects rise above their footprint.

import { renderBoxFromAnchorTile } from '@/lib/map-grid/render-placement'
import type { ObjectRender } from '@/lib/object-render/render-index'

interface Props {
  render: ObjectRender
  name: string
  /** Tile size in grid px. */
  cell: number
  /** The anchor tile's top-left corner relative to the parent box, in grid px. */
  shiftX: number
  shiftY: number
}

export function RenderedObject({ render, name, cell, shiftX, shiftY }: Props) {
  const box = renderBoxFromAnchorTile(render, cell)
  return (
    <img
      src={render.src}
      alt={name}
      draggable={false}
      className="absolute max-w-none pointer-events-none select-none"
      style={{ left: shiftX + box.left, top: shiftY + box.top, width: box.width, height: box.height }}
    />
  )
}
