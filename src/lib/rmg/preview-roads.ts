// ─── RMG roads/rivers preview (issue #210, live preview) ────────────────────
// A real user request: after confirming a live terrain preview, tune road/
// river winding sliders against a live roads preview built on TOP of that
// now-fixed terrain, before committing to full generation.
//
// Deliberately NOT reused by the real `generateRandomMap` pipeline, and NOT
// pixel-guaranteed to match its eventual real roads — see
// `generate-terrain.ts`'s own header comment for the full reasoning: the
// real pipeline routes roads around whatever mines/dwellings/guards
// `populateZones` already placed, which don't exist yet at this point in a
// preview (no objects have been decided). Running the exact same
// pathfinding against a lighter blocked set (spawners + water only, from
// `TerrainResult.state`) is good enough to judge winding/organic shape by
// eye, which is this preview's only job — it is not a forecast of the
// final road tiles. Operates on a CLONE of the terrain result's own blocked
// set so repeated calls (one per slider tweak) never accumulate roads from
// a previous preview render into the next one.

import type { TerrainResult } from './generate-terrain'
import { computeRoadDistanceField, createRoadAvoidanceCost, createWindingCost, shortestPath, smoothPath } from './zone-connections'

export interface PreviewRoadsOptions {
  roadWindingAmplitude?: number
  roadWindingWavelength?: number
  rng?: () => number
}

export interface PreviewRoadsResult {
  roadNodes: Set<number>
  riverNodes: Set<number>
}

const ROAD_AVOIDANCE_RADIUS = 4
const ROAD_AVOIDANCE_STRENGTH = 1.5

/**
 * Roads (one per zone-graph edge) + one river (the map's most graph-distant
 * zone pair) — the same winding-pathfinding shape `generateRandomMap` uses,
 * against `terrain.state`'s own lighter (spawner+water only) blocked set.
 * See this file's own header comment for why this is preview-only.
 */
export function previewRoads(terrain: TerrainResult, options: PreviewRoadsOptions = {}): PreviewRoadsResult {
  const { roadWindingAmplitude = 3, roadWindingWavelength = 50, rng = Math.random } = options
  const { sizeX, sizeZ, graph, zoneDistances, zoneAnchorNode, waterNodesAll } = terrain
  const blocked = new Set(terrain.state.blocked)

  const roadNodes = new Set<number>()
  const roadSmoothWindow = Math.max(4, Math.round(roadWindingWavelength / 10))
  for (const [a, b] of graph.edges) {
    const from = zoneAnchorNode.get(a) as number
    const to = zoneAnchorNode.get(b) as number
    const distanceField = computeRoadDistanceField(roadNodes, sizeX, sizeZ, ROAD_AVOIDANCE_RADIUS)
    const avoidanceCost = createRoadAvoidanceCost(distanceField, sizeX, ROAD_AVOIDANCE_RADIUS, ROAD_AVOIDANCE_STRENGTH)
    const windingCost = createWindingCost(sizeX, from, to, rng, roadWindingAmplitude, 0.5, roadWindingWavelength)
    const combinedCost = (x: number, z: number): number => windingCost(x, z) + avoidanceCost(x, z)
    let path = shortestPath(sizeX, sizeZ, from, to, blocked, combinedCost)
    if (!path && waterNodesAll.size > 0) {
      const blockedWithoutWater = new Set([...blocked].filter((n) => !waterNodesAll.has(n)))
      path = shortestPath(sizeX, sizeZ, from, to, blockedWithoutWater, combinedCost)
    }
    if (path) {
      const smoothed = smoothPath(path, sizeX, blocked, roadSmoothWindow)
      for (const node of smoothed) roadNodes.add(node)
    }
  }

  let riverNodes = new Set<number>()
  let bestDistance = -1
  let riverEndpoints: [number, number] | null = null
  for (let a = 0; a < graph.zones.length; a++) {
    for (let b = a + 1; b < graph.zones.length; b++) {
      if (zoneDistances[a][b] > bestDistance) { bestDistance = zoneDistances[a][b]; riverEndpoints = [a, b] }
    }
  }
  if (riverEndpoints) {
    const [a, b] = riverEndpoints
    const riverFrom = zoneAnchorNode.get(a) as number
    const riverTo = zoneAnchorNode.get(b) as number
    const rawPath = shortestPath(sizeX, sizeZ, riverFrom, riverTo, blocked, createWindingCost(sizeX, riverFrom, riverTo, rng, roadWindingAmplitude, 0.5, roadWindingWavelength))
    const path = rawPath && rawPath.length > 1 ? smoothPath(rawPath, sizeX, blocked, roadSmoothWindow) : rawPath
    if (path && path.length > 1) riverNodes = new Set(path)
  }

  return { roadNodes, riverNodes }
}
