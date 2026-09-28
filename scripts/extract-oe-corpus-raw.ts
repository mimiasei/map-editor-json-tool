// ─── Raw per-tile/per-object corpus extraction for zone inference (issue #225) ─
// Sibling to extract-oe-training-corpus.ts (#224 M1a), which only ever emits
// aggregate histograms/counts — this preserves the raw waterMap/levelsMap/
// climbsMap arrays and every placed object's (type,id,sid,x,z) plus
// player-start owner, the actual per-tile/per-object data zone-inference.ts's
// inferZones() needs. Deliberately a new file, not a reshape of the existing
// script — that aggregate-only output may still be referenced elsewhere in
// the #224 research and shouldn't change shape underneath it.
//
// Reuses map-extract.ts's buildPlacedObjects() for the real (type,id)-keyed
// objects[]/squads[]/markers[] join rather than hand-rolling it — only
// spawnerInfo (sourced from propSpawns, which carries owner/spawnType/
// spawnPointType per instance) is populated in the enrichment; every other
// enrichment table this corpus doesn't need is left as an empty Map/Set.
//
// Run via this project's own esbuild-bundle-and-run technique (see CLAUDE.md):
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/extract-oe-corpus-raw.ts --outfile=/tmp/extract-oe-raw.cjs
//   node /tmp/extract-oe-raw.cjs > plans/training-data/oe-corpus-raw.json

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapContainer, gunzipBytes, type MapContainer } from '@/lib/map-write'
import type { RawMapBlock1, RawMapBlock2 } from '@/lib/map-parser'
import { buildPlacedObjects, type PlacedObjectEnrichment } from '@/lib/map-extract'
import type { PlacedObject } from '@/types/map-context'

const EXCLUDED = new Set(['TheQuest.map', 'Stormlight.map'])
const MAPS_DIR = join(process.cwd(), 'maps')

function parseBlock<T>(container: MapContainer, index: number): T | undefined {
  const chunk = container.chunks[index]
  if (!chunk) return undefined
  try {
    return JSON.parse(new TextDecoder('utf-8').decode(chunk)) as T
  } catch {
    return undefined
  }
}

interface RawPlacedObject {
  type: 0 | 1 | 2
  id: number
  sid: string
  x: number
  z: number
  /** Player slot (1..N) this instance's own propSpawns entry claims — only
   *  ever set on city-spawner/hero-spawner instances. Sourced from
   *  spawnerInfo.owner (propSpawns), NOT objectsProperties.propOwners (a
   *  separate table used for neutral-object ownership overrides). */
  owner?: number
}

interface RawCorpusEntry {
  mapFile: string
  sizeX: number
  sizeZ: number
  waterMap: number[]
  levelsMap: number[]
  climbsMap: number[]
  placedObjects: RawPlacedObject[]
}

async function extractOne(fileName: string): Promise<RawCorpusEntry | { mapFile: string; error: string }> {
  const bytes = new Uint8Array(readFileSync(join(MAPS_DIR, fileName)))
  const container = readMapContainer(await gunzipBytes(bytes))
  const block1 = parseBlock<RawMapBlock1>(container, 0)
  const block2 = parseBlock<RawMapBlock2>(container, 1)
  if (!block1 || !block2) return { mapFile: fileName, error: 'missing block1/block2' }

  const sizeX = block1.sizeX ?? 0
  const sizeZ = block1.sizeZ ?? 0
  const nodeToCoord = (node: number): { x: number; z: number } | undefined =>
    sizeX > 0 ? { x: node % sizeX, z: Math.floor(node / sizeX) } : undefined

  const spawnerInfoByKey = new Map<string, PlacedObject['spawnerInfo']>()
  for (const s of block2.objectsProperties?.propSpawns ?? []) {
    if (s.id === undefined || s.owner === undefined || s.spawnType === undefined || s.spawnPointType === undefined) continue
    spawnerInfoByKey.set(`${s.type ?? ''}:${s.id}`, {
      owner: s.owner,
      spawnType: s.spawnType as 0 | 1 | 2,
      spawnPointType: s.spawnPointType as 0 | 1,
    })
  }

  const enrichment: PlacedObjectEnrichment = {
    entitySidByKey: new Map(),
    displayNameByKey: new Map(),
    noCombineGeometryByKey: new Map(),
    spawnerInfoByKey,
    descriptionByKey: new Map(),
    rewardParamsByKey: new Map(),
    activeByKey: new Map(),
    ownerByKey: new Map(),
    markerActiveByKey: new Map(),
    markerDeleteAfterTriggerByKey: new Map(),
    guardUnitPropsByKey: new Map(),
    citySquadSidsByKey: new Map(),
    randomSquadValueByKey: new Map(),
    isCityByKey: new Set(),
  }

  const placed = buildPlacedObjects(block2, nodeToCoord, enrichment)

  return {
    mapFile: fileName,
    sizeX,
    sizeZ,
    waterMap: block2.waterMap ?? [],
    levelsMap: block2.levelsMap ?? [],
    climbsMap: block2.climbsMap ?? [],
    placedObjects: placed.map((p) => ({
      type: p.type,
      id: p.id,
      sid: p.sid,
      x: p.x,
      z: p.z,
      owner: p.spawnerInfo?.owner,
    })),
  }
}

async function main() {
  const files = readdirSync(MAPS_DIR).filter((f) => f.endsWith('.map') && !EXCLUDED.has(f))
  const results = []
  for (const f of files) {
    results.push(await extractOne(f))
  }
  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
}

main()
