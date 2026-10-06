// Generation statistics for the Classic random map generator: how many rare
// interactables get placed and how often objects stand on a biome they don't
// belong to (Snow, Lava and Sand are strictly isolated). Read-only; prints a
// summary. Run it before and after RMG changes and compare.
//
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/check-rmg-stats.ts --outfile=$TMP/check-rmg-stats.cjs
//   node $TMP/check-rmg-stats.cjs [maps=12] [seed=1]
//
// Needs the game's Core.zip: set CORE_ZIP, else the default Steam path is used.

import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import JSZip from 'jszip'
import { buildCatalog } from '@/lib/catalog/builder'
import { readMapContainer, type MapContainer } from '@/lib/map-write'
import { generateRandomMap } from '@/lib/rmg/generate-random-map'
import { buildClassicOptions, DEFAULT_CLASSIC_SETTINGS } from '@/lib/rmg/classic-presets'
import { createSeededRng } from '@/lib/rmg/seeded-rng'
import { INTERACTABLE_RARE_SIDS } from '@/lib/rmg/object-variety'
import type { CatalogMapObject } from '@/lib/catalog/types'

const CORE_ZIP = process.env.CORE_ZIP ?? 'C:/Program Files (x86)/Steam/steamapps/common/Heroes of Might and Magic Olden Era/HeroesOldenEra_Data/StreamingAssets/Core.zip'
const TEMPLATE = 'src-tauri/resources/template.map'
const MAPS = Number(process.argv[2] ?? 12)
const SEED = Number(process.argv[3] ?? 1)
const CONFIGS = [
  { size: 96, players: 2 }, { size: 128, players: 3 }, { size: 128, players: 4 }, { size: 160, players: 4 }, { size: 192, players: 6 },
]
/** Tile biome ids (terrain-colors.ts) and the catalog's biome strings. */
const BIOME_NAME: Record<number, string> = { 1: 'Grass', 2: 'Desert', 3: 'Deathland', 4: 'Snow', 5: 'Autumn', 6: 'Lava', 7: 'Dirt' }
const RESTRICTED = new Set(['Desert', 'Snow', 'Lava'])
/** The grass pines are multi-purpose (user decision): allowed on every biome. */
const UNIVERSAL_SID = /^pinetree_\d+$/

interface Block2 {
  tilesMap: number[]
  objects: { sid: string; nodes: number[] }[]
}

function zeroWeightSids(catalog: Awaited<ReturnType<typeof buildCatalog>>): Set<string> {
  const positive = new Set<string>()
  const listed = new Set<string>()
  for (const list of catalog.rmgContentLists ?? []) {
    for (const entry of list.content) {
      listed.add(entry.sid)
      if (entry.weight > 0) positive.add(entry.sid)
    }
  }
  return new Set([...listed].filter((s) => !positive.has(s)))
}

async function main() {
  const catalog = await buildCatalog(await JSZip.loadAsync(readFileSync(CORE_ZIP)), 'Core.zip')
  const catalogById = new Map<string, CatalogMapObject>(catalog.mapObjects.map((o) => [o.id, o]))
  const template: MapContainer = readMapContainer(new Uint8Array(gunzipSync(readFileSync(TEMPLATE))))
  const zero = zeroWeightSids(catalog)
  // Faction start dwellings (`barracks_*`) are placed on purpose, never scattered.
  const rare = new Set<string>([...INTERACTABLE_RARE_SIDS, ...zero].filter((s) => !s.startsWith('barracks_')))

  const rareCount = new Map<string, number>()
  const interactableCount = new Map<string, number>()
  const violations = new Map<string, number>()
  const violationExamples = new Map<string, string>()
  let objects = 0
  let interactables = 0
  let maps = 0

  for (let i = 0; i < MAPS; i++) {
    const cfg = CONFIGS[i % CONFIGS.length]
    const rng = createSeededRng(SEED * 1000 + i)
    const options = {
      sizeX: cfg.size, sizeZ: cfg.size, playerCount: cfg.players, playerSpawnerSid: 'city-spawner' as const,
      ...buildClassicOptions(DEFAULT_CLASSIC_SETTINGS, rng), rng,
    }
    const { container } = await generateRandomMap(template, catalog, options)
    const block2 = JSON.parse(new TextDecoder().decode(container.chunks[1])) as Block2
    maps++
    for (const obj of block2.objects ?? []) {
      const info = catalogById.get(obj.sid)
      const sidBiome = UNIVERSAL_SID.test(obj.sid) ? undefined : info?.biome
      for (const node of obj.nodes ?? []) {
        objects++
        if (info?.category === 'interactables') {
          interactables++
          interactableCount.set(obj.sid, (interactableCount.get(obj.sid) ?? 0) + 1)
        }
        if (rare.has(obj.sid)) rareCount.set(obj.sid, (rareCount.get(obj.sid) ?? 0) + 1)
        const tileBiome = BIOME_NAME[block2.tilesMap[node]]
        if (sidBiome && tileBiome && sidBiome !== tileBiome && (RESTRICTED.has(sidBiome) || RESTRICTED.has(tileBiome))) {
          const kind = `${sidBiome} object on ${tileBiome}`
          violations.set(kind, (violations.get(kind) ?? 0) + 1)
          if (!violationExamples.has(kind)) violationExamples.set(kind, obj.sid)
        }
      }
    }
  }

  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0)
  console.log(`maps ${maps}, objects ${objects}, interactables ${interactables} (${interactableCount.size} distinct sids)`)
  console.log(`rare / zero-weight interactables placed: ${sum(rareCount)}`, Object.fromEntries(rareCount))
  console.log(`biome-isolation violations: ${sum(violations)}`)
  for (const [kind, n] of [...violations].sort((a, b) => b[1] - a[1])) console.log(`  ${n}  ${kind}  e.g. ${violationExamples.get(kind)}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
