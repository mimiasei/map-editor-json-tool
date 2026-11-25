// ─── Map Grid — a small picture of one water type ─────────────────────────────
// Drawn the way the grid draws water: the type's tinted ground colour, its translucent overlay and the game's ripple surface on top
// (the surface only when the textures have been extracted, desktop build).

import { useEffect, useRef } from 'react'
import { terrainFillColor, waterOverlayColor } from '@/lib/map-grid/terrain-colors'
import { useWaterSurface, waterSurfacePattern, WATER_SURFACE_ALPHA } from '@/lib/map-grid/water-surface'

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
    ctx.fillStyle = terrainFillColor(undefined, waterId)
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = waterOverlayColor(waterId, WATER_SURFACE_ALPHA)
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const pattern = surface ? waterSurfacePattern(ctx, surface, PX_PER_TILE * DPR) : null
    if (pattern) {
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [waterId, surface])

  return <canvas ref={ref} width={W * DPR} height={H * DPR} style={{ width: W, height: H }} className="rounded border border-border/60" />
}
