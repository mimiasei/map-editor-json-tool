// ─── M1 (issue #224): normalize the real, hand-crafted OE map corpus ────────
// One row of structured JSON per real map — no zone inference (that's a
// separate, harder task; see the research plan), just what's directly
// readable from the container: terrain composition, object/squad/marker
// counts, and (as a side effect) which maps actually lack quest/dialog
// content, which is real evidence for the container's 3-vs-4-chunk shape
// noted in the research plan's open questions.
//
// Run via this project's own esbuild-bundle-and-run verification technique
// (see CLAUDE.md):
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/extract-oe-training-corpus.ts --outfile=/tmp/extract-oe.cjs
//   node /tmp/extract-oe.cjs > plans/training-data/oe-corpus.json
//
// Reuses the real container reader (map-write.ts's readMapContainer/
// gunzipBytes) rather than re-deriving a varint parser — this project's own
// convention (map-parser.ts's parseMapFile is not reused here because it
// hardcodes exactly 4 blocks with no fallback; readMapContainer has no such
// assumption, it just reads chunks until the buffer ends).

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readMapContainer, gunzipBytes, type MapContainer } from '@/lib/map-write'
import type { RawMapBlock1, RawMapBlock2 } from '@/lib/map-parser'

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

function histogram(values: number[]): Record<string, number> {
  const h: Record<string, number> = {}
  for (const v of values) h[v] = (h[v] ?? 0) + 1
  return h
}

interface CorpusEntry {
  mapFile: string
  chunkCount: number
  hasBlock4: boolean
  block3QuestCount: number
  block3DialogCount: number
  sizeX: number
  sizeZ: number
  players: number
  objectCount: number
  squadCount: number
  markerCount: number
  terrainBiomeHistogram: Record<string, number>
  waterTileCount: number
  levelHistogram: Record<string, number>
}

async function extractOne(fileName: string): Promise<CorpusEntry | { mapFile: string; error: string }> {
  const bytes = new Uint8Array(readFileSync(join(MAPS_DIR, fileName)))
  const container = readMapContainer(await gunzipBytes(bytes))
  const block1 = parseBlock<RawMapBlock1>(container, 0)
  const block2 = parseBlock<RawMapBlock2>(container, 1)
  const block3 = parseBlock<{ quests?: unknown[]; dialogs?: unknown[] }>(container, 2)
  if (!block1 || !block2) return { mapFile: fileName, error: 'missing block1/block2' }

  return {
    mapFile: fileName,
    chunkCount: container.chunks.length,
    // Confirmed (issue #224 M1): Block 3 (dialogs/quests) is present, usually
    // trivially empty, in every real map surveyed — it's Block 4 (comment/
    // aiRolesId/counters/interruptions/quests) that's entirely omitted on a
    // map with no AI-role/counter/interruption scripting content, producing
    // the 3-vs-4-chunk container shape noted in the research plan.
    hasBlock4: container.chunks.length > 3,
    block3QuestCount: block3?.quests?.length ?? 0,
    block3DialogCount: block3?.dialogs?.length ?? 0,
    sizeX: block1.sizeX ?? 0,
    sizeZ: block1.sizeZ ?? 0,
    players: block1.spawns?.playersCount ?? 0,
    objectCount: block2.objects?.length ?? 0,
    squadCount: block2.squads?.length ?? 0,
    markerCount: block2.markers?.length ?? 0,
    terrainBiomeHistogram: histogram(block2.tilesMap ?? []),
    waterTileCount: (block2.waterMap ?? []).filter((v) => v > 0).length,
    levelHistogram: histogram(block2.levelsMap ?? []),
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
