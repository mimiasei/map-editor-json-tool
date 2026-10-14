// ─── Left-right mirrored maps ───────────────────────────────────────────────
// A mirrored map is a reflection across the vertical middle line: the content
// of the left half (x < sizeX / 2) is generated as usual and the right half is
// its mirror image, so two players on opposite sides get exactly the same map.
// The layout side lives in zone-archetypes.ts (`layoutArchetype`'s `mirrored`);
// this file holds the tile and zone helpers the generator uses to copy the left
// half onto the right.
//
// Only even widths are supported (the middle line then falls between two
// columns and no tile is its own mirror image).
//
// An object copied to the right half is placed at the mirrored tile with the
// game's own "mirrored" rotation variant (rotations 10-13, see map-write.ts's
// stepRotation). The footprint model for a mirrored object is: the local x axis
// is flipped about the object's pivot (cells at `anchorX - lx + pivotX` instead
// of `anchorX + lx - pivotX`), which makes the reflected anchor exactly
// `sizeX - 1 - anchorX`. That is an assumption — see mirroredFootprintTiles.

import { computeFootprintTiles, type FootprintCell, type FootprintTemplate } from '@/lib/map-grid/footprint'
import type { CatalogMapObject } from '@/lib/catalog/types'
import type { ZoneCenter } from './zone-layout'
import type { ConcreteSquadPlacement, ZonePlacement } from './zone-population'
import type { MirrorInfo } from './zone-archetypes'

/** The tile on the other side of the vertical middle line (same row). */
export function mirrorNode(node: number, sizeX: number): number {
  const x = node % sizeX
  return node - x + (sizeX - 1 - x)
}

/** Whether a tile is in the left half, the half that carries the generated content. */
export function isLeftNode(node: number, sizeX: number): boolean {
  return node % sizeX < sizeX / 2
}

/** Rotation value of the mirror image of an object with rotation `r`: a reflection
 *  reverses the turn direction and toggles the game's mirrored flag (+10). */
export function mirrorRotation(r: number): number {
  const quadrant = r % 10
  const mirrored = r >= 10
  return ((4 - quadrant) % 4) + (mirrored ? 0 : 10)
}

/** An object's footprint cells when it carries the mirrored rotation flag
 *  (rotation >= 10): the local x axis runs the other way round the pivot. Quadrant
 *  turns of non-square footprints are not modelled, as in computeFootprintTiles. */
export function mirroredFootprintTiles(template: FootprintTemplate | undefined, anchorX: number, anchorZ: number): FootprintCell[] {
  if (!template?.nodes?.length) return computeFootprintTiles(template, anchorX, anchorZ)
  const sizeX = template.sizeX ?? 1
  const pivotX = template.pivotX ?? 0
  const pivotZ = template.pivotZ ?? 0
  return template.nodes.map((value, i) => ({
    x: anchorX - (i % sizeX) + pivotX,
    z: anchorZ - Math.floor(i / sizeX) + pivotZ,
    value,
  }))
}

/** The footprint of an object with `rotation`, honouring the mirrored flag. */
export function footprintForRotation(template: FootprintTemplate | undefined, anchorX: number, anchorZ: number, rotation = 0): FootprintCell[] {
  return rotation >= 10 ? mirroredFootprintTiles(template, anchorX, anchorZ) : computeFootprintTiles(template, anchorX, anchorZ)
}

/** `layer` with every right-half tile replaced by the mirror of its left-half tile. */
export function mirrorLayerInPlace<T>(layer: T[], sizeX: number): void {
  for (let node = 0; node < layer.length; node++) {
    if (!isLeftNode(node, sizeX)) layer[node] = layer[mirrorNode(node, sizeX)]
  }
}

/** Changes confined to the left half, plus their mirror images. */
export function mirrorChanges<T extends { node: number }>(changes: T[], sizeX: number): T[] {
  const left = changes.filter((c) => isLeftNode(c.node, sizeX))
  return [...left, ...left.map((c) => ({ ...c, node: mirrorNode(c.node, sizeX) }))]
}

/** The same for a set of tiles. */
export function mirrorNodeSet(nodes: Set<number>, sizeX: number): Set<number> {
  const out = new Set<number>()
  for (const node of nodes) {
    if (!isLeftNode(node, sizeX)) continue
    out.add(node)
    out.add(mirrorNode(node, sizeX))
  }
  return out
}

/**
 * Makes the zone ownership mirror-symmetric. The left half keeps its owners, except
 * that a left tile owned by a right-side zone goes to the nearest left or axis zone;
 * the right half is then the left half's mirror image with each owner swapped for
 * its partner zone. Returns the new owner per tile and the tiles of each zone.
 */
export function symmetrizeOwnership(
  sizeX: number, sizeZ: number, zoneIdByNode: number[], centers: ZoneCenter[], mirror: MirrorInfo,
): { zoneIdByNode: number[]; tilesByZone: Map<number, number[]> } {
  const result = new Array<number>(sizeX * sizeZ)
  const leftOwners = [...mirror.side].filter(([, s]) => s !== 'right').map(([id]) => id)
  for (let z = 0; z < sizeZ; z++) {
    for (let x = 0; x < sizeX / 2; x++) {
      const node = z * sizeX + x
      let owner = zoneIdByNode[node]
      if (mirror.side.get(owner) === 'right') {
        let best = Infinity
        for (const id of leftOwners) {
          const c = centers[id]
          const d = (c.x - x) ** 2 + (c.z - z) ** 2
          if (d < best) { best = d; owner = id }
        }
      }
      result[node] = owner
      result[mirrorNode(node, sizeX)] = mirror.partner.get(owner) as number
    }
  }
  const tilesByZone = new Map<number, number[]>()
  for (const id of mirror.partner.keys()) tilesByZone.set(id, [])
  result.forEach((owner, node) => tilesByZone.get(owner)!.push(node))
  return { zoneIdByNode: result, tilesByZone }
}

export interface MirrorObjectsInput {
  sizeX: number
  sizeZ: number
  /** sid -> parallel arrays; `spawnerSid`'s group is left alone (the player starts are placed in generateTerrain). */
  objectGroups: Map<string, { ids: number[]; nodes: number[]; rotations: number[]; levels: number[] }>
  tempIdToPlacement: Map<number, ZonePlacement>
  /** Guard squads; the array is edited in place. */
  squads: ConcreteSquadPlacement[]
  decorativeIds: Set<number>
  catalogById: Map<string, CatalogMapObject>
  spawnerSid: string
  nextTempId: () => number
}

/**
 * Makes the objects mirror-symmetric: every object whose footprint lies wholly in the
 * left half is kept and gets a mirrored copy (mirrored tile, mirrored rotation, same
 * contents); everything else, i.e. everything in the right half and anything straddling the
 * middle line, is dropped. Idempotent: running it again rebuilds the copies from the
 * left half.
 */
export function mirrorObjects(input: MirrorObjectsInput): { copied: number; dropped: number } {
  const { sizeX, sizeZ, objectGroups, tempIdToPlacement, squads, decorativeIds, catalogById, spawnerSid, nextTempId } = input
  const half = sizeX / 2
  let copied = 0
  let dropped = 0

  const inLeftHalf = (sid: string, node: number, rotation: number): boolean => {
    const x = node % sizeX
    const z = Math.floor(node / sizeX)
    const cells = footprintForRotation(catalogById.get(sid), x, z, rotation).filter((c) => c.value !== 0)
    const covered = cells.length > 0 ? cells : [{ x, z, value: 1 }]
    return covered.every((c) => c.x >= 0 && c.x < half && c.z >= 0 && c.z < sizeZ)
  }

  for (const [sid, group] of objectGroups) {
    if (sid === spawnerSid) continue
    const next = { ids: [] as number[], nodes: [] as number[], rotations: [] as number[], levels: [] as number[] }
    for (let i = 0; i < group.ids.length; i++) {
      const tempId = group.ids[i]
      const rotation = group.rotations[i] ?? 0
      if (!inLeftHalf(sid, group.nodes[i], rotation)) {
        tempIdToPlacement.delete(tempId)
        decorativeIds.delete(tempId)
        dropped++
        continue
      }
      next.ids.push(tempId)
      next.nodes.push(group.nodes[i])
      next.rotations.push(rotation)
      next.levels.push(group.levels[i] ?? 0)
    }
    const keptCount = next.ids.length
    for (let i = 0; i < keptCount; i++) {
      const original = tempIdToPlacement.get(next.ids[i])
      if (!original) continue
      const tempId = nextTempId()
      const node = mirrorNode(next.nodes[i], sizeX)
      const rotation = mirrorRotation(next.rotations[i])
      tempIdToPlacement.set(tempId, { ...original, tempId, node, rotation })
      if (decorativeIds.has(next.ids[i])) decorativeIds.add(tempId)
      next.ids.push(tempId)
      next.nodes.push(node)
      next.rotations.push(rotation)
      next.levels.push(next.levels[i])
      copied++
    }
    group.ids = next.ids
    group.nodes = next.nodes
    group.rotations = next.rotations
    group.levels = next.levels
  }

  const keptSquads = squads.filter((s) => inLeftHalf(s.sid, s.node, 0))
  dropped += squads.length - keptSquads.length
  squads.length = 0
  squads.push(...keptSquads, ...keptSquads.map((s) => ({ ...s, tempId: nextTempId(), node: mirrorNode(s.node, sizeX) })))
  copied += keptSquads.length
  return { copied, dropped }
}
