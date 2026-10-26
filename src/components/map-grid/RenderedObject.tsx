// An object drawn from its render (see lib/object-render). Positioned absolutely inside the grid cell box it belongs to,
// and allowed to spill out of it: renders are 3/4 views, so tall objects rise above their footprint.

import { renderBoxFromAnchorTile } from '@/lib/map-grid/render-placement'
import { Sparkles } from '@/components/ui/icons'
import { FX_IMAGE_STYLE, FX_SPARKLE_SIZE, FX_SPARKLE_STYLE } from '@/lib/map-grid/fx-style'
import type { ObjectRender } from '@/lib/object-render/render-index'

interface Props {
  render: ObjectRender
  name: string
  /** Tile size in grid px. */
  cell: number
  /** The anchor tile's top-left corner relative to the parent box, in grid px. */
  shiftX: number
  shiftY: number
  /** A visual effect (fog, light, flies): drawn half see-through with a sparkle on its anchor tile, so it reads as an effect, not an object. */
  fx?: boolean
  /** Placed mirrored (rotations[] >= 10): flipped left-right around the anchor tile's centre. */
  mirrored?: boolean
  /** Tiles to move a mirrored image right: the footprint is anchored at its left tile, so the flip alone would send the body to the left of it. */
  mirrorShiftTiles?: number
}

export function RenderedObject({ render, name, cell, shiftX, shiftY, fx, mirrored, mirrorShiftTiles = 0 }: Props) {
  const box = renderBoxFromAnchorTile(render, cell)
  return (
    <>
      <img
        src={render.src}
        alt={name}
        draggable={false}
        className="absolute max-w-none pointer-events-none select-none"
        style={{ left: shiftX + box.left, top: shiftY + box.top, width: box.width, height: box.height, ...(mirrored ? { transform: `translateX(${mirrorShiftTiles * cell}px) scaleX(-1)`, transformOrigin: `${cell / 2 - box.left}px 50%` } : undefined), ...(fx ? FX_IMAGE_STYLE : undefined) }}
      />
      {fx && (
        <Sparkles
          size={cell * FX_SPARKLE_SIZE}
          className="absolute pointer-events-none select-none text-white"
          style={{ left: shiftX + cell * (1 - FX_SPARKLE_SIZE) / 2, top: shiftY + cell * (1 - FX_SPARKLE_SIZE) / 2, ...FX_SPARKLE_STYLE }}
        />
      )}
    </>
  )
}
