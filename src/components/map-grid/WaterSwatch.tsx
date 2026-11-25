// ─── Map Grid — a small picture of one water type ─────────────────────────────
// The type's own water colour with the game's ripple surface on top (the surface only when the textures have been extracted, desktop
// build). On the map the water sits on dark ground, so it reads as the plain type colour; the light ground tint the base canvas uses
// under water made this swatch much paler than the water on the map (checked against a GME screenshot of Water (Grass)).

import { useEffect, useRef } from 'react'
import { waterOverlayColor } from '@/lib/map-grid/terrain-colors'
import { useWaterSurface, waterSurfacePattern } from '@/lib/map-grid/water-surface'

const W = 56
const H = 26
const DPR = 2
/** Pixels per tile of the ripple pattern in the swatch: a few ripples across it. */
const PX_PER_TILE = 24

export default function WaterSwatch({ waterId }: { waterId: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const surface = useWaterSurface()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = waterOverlayColor(waterId, 1)
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const pattern = surface ? waterSurfacePattern(ctx, surface, PX_PER_TILE * DPR) : null
    if (pattern) {
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [waterId, surface])

  return <canvas ref={ref} width={W * DPR} height={H * DPR} style={{ width: W, height: H }} className="rounded border border-border/60" />
}
