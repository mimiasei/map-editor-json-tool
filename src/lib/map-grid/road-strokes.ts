// ─── Roads from the game's own strokes ───────────────────────────────────────
// The game does not paint a road as a band: the materials testRoad (stone) and testRoad2 (dirt) are sprite sheets of six strokes each
// (road_stone_1, road_dirt_1: 1024x512, three columns by two rows, real alpha, strokes drawn upright, three nearly straight and three
// bent), and a road is a chain of those strokes laid between neighbouring road tiles, picked at random, so joints and T-junctions come
// from strokes overlapping. Seen in the game's screenshots of rivers_roads.map: roads connect diagonally too (a chain of corner-touching
// tiles is one smooth road), and a dirt road that meets a stone one blends into it. How the game picks and places the strokes is not
// known (no game code was read); this lays one stroke per connection, which matches those screenshots by eye.

import { useEffect, useState } from 'react'
import { loadLayer } from './terrain-textures'

export type RoadKind = 'dirt' | 'stone'

/** Sheet to read, the colour its strokes average to in the game's top-down screenshots (the sheets are darker than what is drawn), and how much wider than the sheet's stroke the road is drawn (the stone road is broader in the game). */
const SHEETS: Record<RoadKind, { name: string; target: readonly [number, number, number]; width: number }> = {
  dirt: { name: 'road_dirt_1', target: [112, 84, 70], width: 0.65 },
  stone: { name: 'road_stone_1', target: [168, 166, 160], width: 0.65 },
}
const COLUMNS = 3
const ROWS = 2

/** How many tiles one repeat of the cobble texture (512 px, stones of about 50 px) covers, so a stone is about a sixth of the road's width. */
const STONE_FILL_TILES = 1.6

// road_stone's colour is pale grey stones on near-white; its alpha is a height map (stones high, joints low: joints average a brighter
// colour than stones in the extracted file), so the game's dark joints must come from alpha. The dark colour and the alpha range
// that fades to it are chosen by eye against the game's look, not read from game data.
const STONE_JOINT_RGB = [38, 36, 34] as const
const JOINT_ALPHA_FROM = 40
const JOINT_ALPHA_TO = 150

/** Darkens the joints of the cobble texture by its alpha height map, and makes it opaque. */
function bakeStoneJoints(rgba: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const t = Math.min(1, Math.max(0, (rgba[i + 3] - JOINT_ALPHA_FROM) / (JOINT_ALPHA_TO - JOINT_ALPHA_FROM)))
    for (let c = 0; c < 3; c++) rgba[i + c] = STONE_JOINT_RGB[c] + (rgba[i + c] - STONE_JOINT_RGB[c]) * t
    rgba[i + 3] = 255
  }
}

/** Stroke length as a share of the distance between two road tiles' centres: a little over, so neighbours overlap into one road. */
const OVERLAP = 1.12

export interface RoadStrokes {
  /** Six canvases per kind, each cropped to the stroke's opaque area. */
  strokes: Record<RoadKind, HTMLCanvasElement[]>
  /** Height in sheet pixels of a typical stroke: drawn this tall = one tile long. */
  refHeight: Record<RoadKind, number>
  /** The cobble texture the stone road is filled with (the strokes give its shape), or null when not extracted. */
  stoneFill: HTMLCanvasElement | null
}

let cached: Promise<RoadStrokes | null> | null = null

async function loadKind(kind: RoadKind): Promise<{ strokes: HTMLCanvasElement[]; refHeight: number } | null> {
  const sheet = await loadLayer(SHEETS[kind].name, true).catch(() => null)
  if (!sheet) return null
  const cw = Math.floor(sheet.width / COLUMNS)
  const ch = Math.floor(sheet.height / ROWS)
  const g = sheet.getContext('2d')
  if (!g) return null
  const strokes: HTMLCanvasElement[] = []
  const heights: number[] = []
  const sum = [0, 0, 0]
  let count = 0
  const cells: { img: ImageData; x0: number; y0: number; x1: number; y1: number }[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      const img = g.getImageData(c * cw, r * ch, cw, ch)
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const i = (y * cw + x) * 4
          if (img.data[i + 3] < 40) continue
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
          if (img.data[i + 3] > 200) {
            sum[0] += img.data[i]; sum[1] += img.data[i + 1]; sum[2] += img.data[i + 2]; count++
          }
        }
      }
      cells.push({ img, x0, y0, x1, y1 })
    }
  }
  if (count === 0) return null
  const [tr, tg, tb] = SHEETS[kind].target
  const k = [tr / (sum[0] / count), tg / (sum[1] / count), tb / (sum[2] / count)]
  for (const { img, x0, y0, x1, y1 } of cells) {
    if (x1 < 0) continue
    for (let i = 0; i < img.data.length; i += 4) {
      img.data[i] = Math.min(255, img.data[i] * k[0])
      img.data[i + 1] = Math.min(255, img.data[i + 1] * k[1])
      img.data[i + 2] = Math.min(255, img.data[i + 2] * k[2])
    }
    const full = document.createElement('canvas')
    full.width = cw
    full.height = ch
    full.getContext('2d')?.putImageData(img, 0, 0)
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const crop = document.createElement('canvas')
    crop.width = w
    crop.height = h
    crop.getContext('2d')?.drawImage(full, x0, y0, w, h, 0, 0, w, h)
    strokes.push(crop)
    heights.push(h)
  }
  heights.sort((a, b) => a - b)
  return { strokes, refHeight: heights[Math.floor(heights.length / 2)] }
}

/** Both sheets, or null while one is not extracted yet. */
export function loadRoadStrokes(): Promise<RoadStrokes | null> {
  cached ??= Promise.all([loadKind('dirt'), loadKind('stone'), loadLayer('road_stone', true, bakeStoneJoints).catch(() => null)]).then(([dirt, stone, stoneFill]) => {
    if (!dirt || !stone) return null
    return {
      stoneFill,
      strokes: { dirt: dirt.strokes, stone: stone.strokes },
      refHeight: { dirt: dirt.refHeight, stone: stone.refHeight },
    }
  })
  return cached
}

/** Forget a failed load, so a later extraction is picked up. */
export function resetRoadStrokes(): void {
  cached = null
}

export interface RoadSegment {
  /** Both ends, as tile coordinates (z grows north). */
  ax: number
  az: number
  bx: number
  bz: number
  kind: RoadKind
  variant: number
  flip: boolean
}

function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return h >>> 0
}

/** The connections to the east, north-east, north and north-west; every pair of road tiles is visited once. */
const FORWARD = [[1, 0], [1, 1], [0, 1], [-1, 1]] as const

/**
 * One segment per pair of connected road tiles. `roadAt` gives 0 (none), 1 (dirt) or 2 (stone). A diagonal link is left out when either
 * tile beside it is a road too, because the two straight links already join those tiles. Stone only where both ends are stone.
 */
export function buildRoadSegments(sizeX: number, sizeZ: number, roadAt: (node: number) => number): RoadSegment[] {
  const out: RoadSegment[] = []
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const here = roadAt(z * sizeX + x)
      if (!here) continue
      FORWARD.forEach(([dx, dz], d) => {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= sizeX || nz >= sizeZ) return
        const there = roadAt(nz * sizeX + nx)
        if (!there) return
        if (dx !== 0 && dz !== 0 && (roadAt(z * sizeX + nx) || roadAt(nz * sizeX + x))) return
        const h = hash(z * sizeX + x, d)
        out.push({ ax: x, az: z, bx: nx, bz: nz, kind: here === 2 && there === 2 ? 'stone' : 'dirt', variant: h % 6, flip: ((h >>> 8) & 1) === 1 })
      })
    }
  }
  return out
}

/**
 * A tile with a road and no road neighbour at all has no segment; it gets a short stroke of its own, so it still shows.
 */
export function buildLoneRoadTiles(sizeX: number, sizeZ: number, roadAt: (node: number) => number): { x: number; z: number; kind: RoadKind; variant: number }[] {
  const out: { x: number; z: number; kind: RoadKind; variant: number }[] = []
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX; x++) {
      const here = roadAt(z * sizeX + x)
      if (!here) continue
      let alone = true
      for (let dz = -1; dz <= 1 && alone; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && x + dx >= 0 && z + dz >= 0 && x + dx < sizeX && z + dz < sizeZ && roadAt((z + dz) * sizeX + x + dx)) { alone = false; break }
        }
      }
      if (alone) out.push({ x, z, kind: here === 2 ? 'stone' : 'dirt', variant: hash(z * sizeX + x, 9) % 6 })
    }
  }
  return out
}

/** Draw every stroke. `px` = canvas pixels per tile; the canvas row of tile z is sizeZ - 1 - z. */
export function drawRoads(ctx: CanvasRenderingContext2D, assets: RoadStrokes, segments: RoadSegment[], lone: ReturnType<typeof buildLoneRoadTiles>, px: number, sizeZ: number): void {
  ctx.imageSmoothingQuality = 'high'
  const stamp = (ctx: CanvasRenderingContext2D, kind: RoadKind, variant: number, cx: number, cz: number, angle: number, length: number, flip: boolean) => {
    const stroke = assets.strokes[kind][variant % assets.strokes[kind].length]
    const unit = (px * OVERLAP) / assets.refHeight[kind] // canvas pixels per sheet pixel for a stroke one tile long
    ctx.save()
    ctx.translate(cx * px, (sizeZ - 1 - cz + 0.5) * px)
    ctx.rotate(angle)
    if (flip) ctx.scale(-1, 1)
    const wide = stroke.width * unit * SHEETS[kind].width
    ctx.drawImage(stroke, -wide / 2, (-stroke.height * unit * length) / 2, wide, stroke.height * unit * length)
    ctx.restore()
  }
  const lay = (target: CanvasRenderingContext2D, kind: RoadKind) => {
    for (const s of segments) {
      if (s.kind !== kind) continue
      const dx = s.bx - s.ax
      const dz = s.bz - s.az
      // The strokes are drawn upright; the canvas y axis runs south, so a step to the north (dz = 1) is "up".
      stamp(target, kind, s.variant, (s.ax + s.bx) / 2 + 0.5, (s.az + s.bz) / 2, Math.atan2(dx, dz), Math.hypot(dx, dz), s.flip)
    }
    for (const l of lone) {
      if (l.kind === kind) stamp(target, kind, l.variant, l.x + 0.5, l.z, 0, 0.7, false)
    }
  }
  // Dirt first, so a stone road lies over a dirt one where they meet.
  lay(ctx, 'dirt')
  const fill = assets.stoneFill
  const layer = fill ? document.createElement('canvas') : null
  const lg = layer?.getContext('2d')
  if (!fill || !layer || !lg) {
    lay(ctx, 'stone')
    return
  }
  // The stone strokes give the shape; the cobble texture, laid in map space so neighbouring strokes continue it, is what shows.
  layer.width = ctx.canvas.width
  layer.height = ctx.canvas.height
  lg.imageSmoothingQuality = 'high'
  lay(lg, 'stone')
  const pattern = lg.createPattern(fill, 'repeat')
  if (pattern) {
    pattern.setTransform(new DOMMatrix().scale((px * STONE_FILL_TILES) / fill.width))
    lg.globalCompositeOperation = 'source-atop'
    lg.globalAlpha = 1
    lg.fillStyle = pattern
    lg.fillRect(0, 0, layer.width, layer.height)
  }
  ctx.drawImage(layer, 0, 0)
}

/** The stroke sheets once extracted (and again after a new extraction), else null. */
export function useRoadStrokes(): RoadStrokes | null {
  const [assets, setAssets] = useState<RoadStrokes | null>(null)
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void loadRoadStrokes().then((a) => {
        if (cancelled) return
        if (a) setAssets(a)
        else resetRoadStrokes()
      })
    }
    refresh()
    window.addEventListener('oe:thumbnails-extracted', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('oe:thumbnails-extracted', refresh)
    }
  }, [])
  return assets
}
