// ─── Map Grid — single-tile elevation spike/pit auto-fix ────────────────────
// Normalizes each spike/pit found by elevation-spike-validation.ts to match
// its uniform surroundings — reusing map-write.ts's paintLevelTiles mutation
// (its existing water-clear-when-raised-off-level--1 side effect included)
// rather than re-deriving the write. Also clears the spike's own climbsMap
// marker (meaningless once the level difference it might have bordered is
// gone) and, conservatively, a neighbor's climbsMap marker only if that
// neighbor no longer borders ANY real level difference after the flatten —
// a neighbor still serving a genuine boundary elsewhere is left alone.

import type { MapContext } from '@/types/map-context'
import { findElevationSpikePlacements } from './elevation-spike-validation'

export interface ElevationSpikeAutoFixResult {
  levelChanges: { node: number; level: number }[]
  climbClears: number[]
}

type SpikeAutoFixContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap'>

const NEIGHBOR_OFFSETS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]]

function hasAnyDifferentLevelNeighbor(node: number, sizeX: number, sizeZ: number, levels: number[]): boolean {
  const x = node % sizeX
  const z = Math.floor(node / sizeX)
  const ownLevel = levels[node] ?? 0
  for (const [dx, dz] of NEIGHBOR_OFFSETS) {
    const nx = x + dx
    const nz = z + dz
    if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
    if ((levels[nz * sizeX + nx] ?? 0) !== ownLevel) return true
  }
  return false
}

export function computeElevationSpikeAutoFix(context: SpikeAutoFixContext): ElevationSpikeAutoFixResult {
  const spikes = findElevationSpikePlacements(context)
  if (spikes.length === 0) return { levelChanges: [], climbClears: [] }

  const { sizeX, sizeZ } = context
  // Mutable working copies — a later spike in this same pass sees earlier
  // fixes, matching the "one static snapshot per call, outer loop converges
  // across calls" convention this codebase already uses (auto-fix-pass.ts).
  const levels = [...context.levelsMap]
  const climbs = [...context.climbsMap]

  const levelChanges: { node: number; level: number }[] = []
  const climbClears = new Set<number>()
  const fixedNodes = new Set<number>()

  for (const spike of spikes) {
    if (fixedNodes.has(spike.node)) continue
    fixedNodes.add(spike.node)

    levels[spike.node] = spike.toLevel
    levelChanges.push({ node: spike.node, level: spike.toLevel })
    if (climbs[spike.node] === 1) {
      climbs[spike.node] = 0
      climbClears.add(spike.node)
    }

    const x = spike.x
    const z = spike.z
    for (const [dx, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nx >= sizeX || nz < 0 || nz >= sizeZ) continue
      const nNode = nz * sizeX + nx
      if (climbs[nNode] !== 1) continue
      if (!hasAnyDifferentLevelNeighbor(nNode, sizeX, sizeZ, levels)) {
        climbs[nNode] = 0
        climbClears.add(nNode)
      }
    }
  }

  return { levelChanges, climbClears: [...climbClears] }
}
