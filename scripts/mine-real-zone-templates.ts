// ─── Mine real OE maps' inferred zone graphs into .rmg.json templates
// (issue #224 M4) ──────────────────────────────────────────────────────────
// Runs zone-inference.ts's inferZones() (issue #225) against all 12 real
// hand-crafted maps and writes each CONNECTED result as a real .rmg.json
// game template (this repo's existing external template format, parsed
// unchanged by rmg-template-import.ts) into both maps/templates/ and
// src-tauri/resources/templates/ (kept in sync, same convention as every
// other bundled template).
//
// Only 6 of the 12 real maps' inferred zone graphs come out CONNECTED under
// this first-pass, terrain-only (water + elevation-wall) blocked-tile model
// — the other 6 (Broken_Alliance, Glittering_Strait, The_Mysterious_Island,
// The_Slaughterfield_(II), ascension_to_the_throne, song_of_murmurwood) are
// deliberately excluded, not silently fixed: generate-terrain.ts's own
// zoneDistanceMatrix() throws on a disconnected imported topology, so
// shipping one of these would be a real, reproducible crash the moment a
// user picked it. The most likely real cause (not fully confirmed): these
// maps plausibly place some players on separate landmasses reachable only
// by boat, which this first-pass model (like the production
// buildBlockedTileSet it deliberately doesn't call, see zone-inference.ts's
// header) has no naval-travel concept for at all. Revisit only if a future
// session adds boat-aware reachability to zone-inference.ts.
//
// Zone `size` is the zone's own real measured tile count, rescaled so the
// smallest zone in that specific map = 1.0 (zone-layout.ts/zone-shape-
// penrose.ts already treat `size` as a purely RELATIVE weight — see
// buildTopologyFromVariant's own doc comment — so there's no fixed
// universal unit to match, just real per-map area ratios to preserve).
//
// Run via this project's own esbuild-bundle-and-run technique:
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/mine-real-zone-templates.ts --outfile=/tmp/mine.cjs
//   node /tmp/mine.cjs
//
// Requires plans/training-data/oe-corpus-raw.json to already exist (run
// scripts/extract-oe-corpus-raw.ts first if it doesn't).

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inferZones, type ZoneInferenceInput } from '@/lib/rmg/zone-inference'
import { zoneDistanceMatrix, type ZoneGraph } from '@/lib/rmg/zone-graph'
import type { PlacedObject } from '@/types/map-context'

interface RawPlacedObject { type: 0 | 1 | 2; id: number; sid: string; x: number; z: number; owner?: number }
interface RawCorpusEntry {
  mapFile: string
  sizeX: number
  sizeZ: number
  waterMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  placedObjects: RawPlacedObject[]
}

const REPO_ROOT = join(process.cwd())
const OUT_DIRS = [join(REPO_ROOT, 'maps/templates'), join(REPO_ROOT, 'src-tauri/resources/templates')]

const data: (RawCorpusEntry | { mapFile: string; error: string })[] = JSON.parse(
  readFileSync(join(REPO_ROOT, 'plans/training-data/oe-corpus-raw.json'), 'utf8'),
)

function toPlacedObjects(sizeX: number, raw: RawPlacedObject[]): PlacedObject[] {
  return raw.map((o) => ({
    key: `${o.type}:${o.id}`, type: o.type, id: o.id, sid: o.sid, x: o.x, z: o.z, node: o.z * sizeX + o.x,
    spawnerInfo: o.owner !== undefined ? { owner: o.owner, spawnType: 0 as const, spawnPointType: 0 as const } : undefined,
  }))
}

function isConnected(graph: ZoneGraph): boolean {
  if (graph.zones.length === 0) return false
  const dist = zoneDistanceMatrix(graph)
  for (const row of dist) for (const d of row) if (d === Infinity) return false
  return true
}

function buildTemplateJson(mapFile: string, sizeX: number, sizeZ: number, graph: ZoneGraph): object {
  const zoneName = (id: number) => `Zone${id}`
  const positiveSizes = graph.zones.map((z) => z.size).filter((s) => s > 0)
  const floor = positiveSizes.length > 0 ? Math.min(...positiveSizes) : 1
  const zones = graph.zones.map((z) => {
    const raw = z.size > 0 ? z.size : floor
    const zone: { name: string; size: number; mainObjects?: { type: string; spawn?: string }[] } = {
      name: zoneName(z.id),
      size: Math.round((raw / floor) * 100) / 100,
    }
    if (z.kind === 'player') zone.mainObjects = [{ type: 'Spawn', spawn: `Player${z.playerIndex}` }]
    return zone
  })
  const connections = graph.edges.map(([a, b], i) => ({
    name: `Conn${i}`, from: zoneName(a), to: zoneName(b), connectionType: 'Direct', road: true,
  }))
  const displayName = mapFile.replace(/\.map$/, '').replace(/_/g, ' ').replace(/[()]/g, '').trim()
  return {
    name: `Real: ${displayName}`,
    gameMode: 'Classic',
    description: `Zone graph mined from the real hand-crafted map "${displayName}" (issue #225 zone inference, issue #224 M4) — ${graph.zones.length} zones (${graph.zones.filter((z) => z.kind === 'player').length} players), ${graph.edges.length} connections.`,
    sizeX,
    sizeZ,
    variants: [{ zones, connections }],
  }
}

function fileNameFor(mapFile: string): string {
  return 'RealMap_' + mapFile.replace(/\.map$/, '').replace(/[^A-Za-z0-9]+/g, '_') + '.rmg.json'
}

function main(): void {
  let minedCount = 0
  for (const entry of data) {
    if ('error' in entry) { console.log(entry.mapFile, 'SKIP (parse error)'); continue }
    const input: ZoneInferenceInput = {
      sizeX: entry.sizeX, sizeZ: entry.sizeZ, waterMap: entry.waterMap, levelsMap: entry.levelsMap, climbsMap: entry.climbsMap,
      placedObjects: toPlacedObjects(entry.sizeX, entry.placedObjects),
    }
    const result = inferZones(input)
    if (!isConnected(result.graph)) { console.log(entry.mapFile, 'SKIP (disconnected inferred zone graph)'); continue }

    const json = buildTemplateJson(entry.mapFile, entry.sizeX, entry.sizeZ, result.graph)
    const fileName = fileNameFor(entry.mapFile)
    const text = JSON.stringify(json, null, 2) + '\n'
    for (const dir of OUT_DIRS) writeFileSync(join(dir, fileName), text)
    console.log(entry.mapFile, '->', fileName, `(${result.graph.zones.length} zones, ${result.graph.edges.length} edges)`)
    minedCount++
  }
  console.log(`\nMined ${minedCount} real templates.`)
}

main()
