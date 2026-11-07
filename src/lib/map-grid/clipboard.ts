// ─── Map Grid clipboard: copy objects, flip / rotate the copy, plan a paste ─────
// Objects only (objects[] and squads[]); zone markers, player spawners and portals are never copied: spawners claim a player slot and portals are
// linked pairs, so a pasted copy would break the map. Positions are stored relative to the bottom-left corner of the copied area's footprint box.
//
// Mirroring uses the format's own mirrored variant (rotation + 10, flipped about the centre of the block tiles, see `mirrorSpan` in footprint.ts).
// A 90 degree turn moves every anchor around the area's centre and turns only unmirrored decorations; footprint quarter turns are not modelled
// (footprint.ts), so large objects may land a tile off.

import { computeFootprintTiles, type FootprintTemplate } from '@/lib/map-grid/footprint'
import type { PlacedObject } from '@/types/map-context'

/** Footprint extent in tiles relative to the anchor, inclusive. */
export interface FootprintBox { x0: number; x1: number; z0: number; z1: number }

/** Resolves a sid to its footprint template (undefined for squads and unknown sids: a single tile). */
export type TemplateLookup = (sid: string) => FootprintTemplate | undefined

/** What is carried besides sid/position/rotation; copied with follow-up edits after the objects exist. */
export interface ClipboardProps {
  owner?: number
  guardUnitProps?: { sid: string; count: number }[]
  randomSquadValue?: number
  randomSquadFraction?: string
  randomHireTier?: number
  randomHireFraction?: number
  rewardParams?: string[]
  displayName?: string
  description?: string
}

export interface ClipboardItem {
  /** 0 = objects[], 2 = squads[]. */
  type: 0 | 2
  sid: string
  /** Anchor offset from the area's bottom-left corner. */
  dx: number
  dz: number
  rotation: number
  /** A ground decoration (catalog category `environments`): the only kind that may be turned. */
  decoration: boolean
  props: ClipboardProps
}

export interface ObjectClipboard {
  items: ClipboardItem[]
  /** Size of the copied area's footprint box, in tiles. */
  width: number
  height: number
}

/** Spawners and portals are never copied (see the header). */
export function isCopyable(o: PlacedObject): boolean {
  if (o.type === 1) return false
  if (o.spawnerInfo || o.portalInfo) return false
  return o.sid !== 'city-spawner' && o.sid !== 'hero-spawner'
}

export function footprintBox(sid: string, type: 0 | 2, rotation: number, lookup: TemplateLookup): FootprintBox {
  if (type !== 0) return { x0: 0, x1: 0, z0: 0, z1: 0 }
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const cell of computeFootprintTiles(lookup(sid), 0, 0, rotation)) {
    if (cell.value === 0) continue
    if (cell.x < x0) x0 = cell.x
    if (cell.x > x1) x1 = cell.x
    if (cell.z < z0) z0 = cell.z
    if (cell.z > z1) z1 = cell.z
  }
  return x0 === Infinity ? { x0: 0, x1: 0, z0: 0, z1: 0 } : { x0, x1, z0, z1 }
}

function propsOf(o: PlacedObject): ClipboardProps {
  const props: ClipboardProps = {}
  if (o.owner !== undefined) props.owner = o.owner
  if (o.guardUnitProps?.length) props.guardUnitProps = o.guardUnitProps.map((u) => ({ ...u }))
  if (o.randomSquadValue !== undefined) props.randomSquadValue = o.randomSquadValue
  if (o.randomSquadFraction !== undefined) props.randomSquadFraction = o.randomSquadFraction
  if (o.randomHireTier !== undefined) props.randomHireTier = o.randomHireTier
  if (o.randomHireFraction !== undefined) props.randomHireFraction = o.randomHireFraction
  if (o.rewardParams?.length) props.rewardParams = [...o.rewardParams]
  if (o.displayName) props.displayName = o.displayName
  if (o.description) props.description = o.description
  return props
}

/** The copy of `objects` (spawners, portals and markers are dropped), or null when nothing is left. */
export function copyObjects(objects: PlacedObject[], lookup: TemplateLookup, isDecoration: (sid: string) => boolean): ObjectClipboard | null {
  const usable = objects.filter(isCopyable)
  if (usable.length === 0) return null
  const boxes = usable.map((o) => footprintBox(o.sid, o.type as 0 | 2, o.rotation ?? 0, lookup))
  const minX = Math.min(...usable.map((o, i) => o.x + boxes[i].x0))
  const maxX = Math.max(...usable.map((o, i) => o.x + boxes[i].x1))
  const minZ = Math.min(...usable.map((o, i) => o.z + boxes[i].z0))
  const maxZ = Math.max(...usable.map((o, i) => o.z + boxes[i].z1))
  return {
    width: maxX - minX + 1,
    height: maxZ - minZ + 1,
    items: usable.map((o) => ({
      type: o.type as 0 | 2,
      sid: o.sid,
      dx: o.x - minX,
      dz: o.z - minZ,
      rotation: o.rotation ?? 0,
      decoration: o.type === 0 && isDecoration(o.sid),
      props: propsOf(o),
    })),
  }
}

const toggleMirror = (rotation: number): number => (rotation >= 10 ? rotation - 10 : rotation + 10)

/** Whether a flip should set the mirrored variant: decorations and multi-tile objects; a 1x1 pile or squad looks the same mirrored. */
function mirrorsWithFlip(item: ClipboardItem, lookup: TemplateLookup): boolean {
  if (item.type !== 0) return false
  if (item.decoration) return true
  const box = footprintBox(item.sid, 0, item.rotation, lookup)
  return box.x1 > box.x0
}

/** Left-right mirror of the copied area (the objects' mirrored variant is toggled where it changes how they look). */
export function flipHorizontal(clip: ObjectClipboard, lookup: TemplateLookup): ObjectClipboard {
  return {
    ...clip,
    items: clip.items.map((item) => {
      const rotation = mirrorsWithFlip(item, lookup) ? toggleMirror(item.rotation) : item.rotation
      const before = footprintBox(item.sid, item.type, item.rotation, lookup)
      const after = footprintBox(item.sid, item.type, rotation, lookup)
      // The footprint's left edge lands where its right edge was; the anchor follows from the new variant's own offsets.
      const left = clip.width - 1 - (item.dx + before.x1)
      return { ...item, rotation, dx: left - after.x0, dz: item.dz + before.z0 - after.z0 }
    }),
  }
}

/**
 * Turns the copied area a quarter clockwise on screen: every anchor goes from (x, z) to (z, width - 1 - x). Only unmirrored decorations also get
 * rotation + 1; everything else keeps its own rotation and is just repositioned. Footprints are not rotated (see footprint.ts), so a non-square or
 * off-centre object can end up a tile off; the paste preview shows blocked tiles and the user adjusts afterwards. Mirrored variants (10+) are left
 * alone because their turning direction is unverified.
 */
export function rotateClockwise(clip: ObjectClipboard): ObjectClipboard {
  return {
    width: clip.height,
    height: clip.width,
    items: clip.items.map((item) => ({
      ...item,
      dx: item.dz,
      dz: clip.width - 1 - item.dx,
      rotation: item.decoration && item.rotation < 10 ? (item.rotation + 1) % 4 : item.rotation,
    })),
  }
}

export interface PastePlacement {
  item: ClipboardItem
  x: number
  z: number
  /** Footprint tiles (non-empty cells) at the target, for the preview. */
  cells: { x: number; z: number }[]
  /** False when part of the footprint is off the map or on water / an elevation wall. */
  ok: boolean
}

/** Where each item lands when the area's bottom-left corner is put on (originX, originZ). `blocked` tells whether a tile cannot take an object. */
export function planPaste(
  clip: ObjectClipboard,
  originX: number,
  originZ: number,
  lookup: TemplateLookup,
  sizeX: number,
  sizeZ: number,
  blocked: (node: number) => boolean,
): PastePlacement[] {
  return clip.items.map((item) => {
    const x = originX + item.dx
    const z = originZ + item.dz
    const solid = item.type === 0
      ? computeFootprintTiles(lookup(item.sid), x, z, item.rotation).filter((c) => c.value !== 0).map((c) => ({ x: c.x, z: c.z }))
      : []
    // Ground clutter (grass, mushrooms) has no footprint at all: its anchor tile still has to be on the map and dry.
    const cells = solid.length > 0 ? solid : [{ x, z }]
    const ok = cells.every((c) => c.x >= 0 && c.x < sizeX && c.z >= 0 && c.z < sizeZ && !blocked(c.z * sizeX + c.x))
    return { item, x, z, cells, ok }
  })
}
