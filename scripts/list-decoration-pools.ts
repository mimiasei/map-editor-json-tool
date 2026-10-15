// Prints every biome's decoration objects as the biome decoration mix rules see
// them (rmg/biome-decoration-mix.ts): per biome and list, the parsed type /
// variant and the numbers present. With --mixed it applies the rules and prints,
// per biome and list, which objects come from another biome and what share of
// the picks they get.
//
//   npx esbuild --bundle --platform=node --format=cjs --alias:@=./src \
//     scripts/list-decoration-pools.ts --outfile=$TMP/list-decoration-pools.cjs
//   node $TMP/list-decoration-pools.cjs [--mixed]
//
// Needs the game's Core.zip: set CORE_ZIP, else the default Steam path is used.

import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { buildCatalog } from '@/lib/catalog/builder'
import { buildFuzzyObstaclePools, buildFuzzyObstacleWeights } from '@/lib/map-grid/fuzzy-obstacle'
import { parseDecorationSid } from '@/lib/map-grid/decoration-sid'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import { applyBiomeDecorationMix } from '@/lib/rmg/biome-decoration-mix'

const CORE_ZIP = process.env.CORE_ZIP ?? 'C:/Program Files (x86)/Steam/steamapps/common/Heroes of Might and Magic Olden Era/HeroesOldenEra_Data/StreamingAssets/Core.zip'
const LISTS = ['obstacles', 'clutter', 'mountains', 'pools'] as const

async function main() {
  const catalog = await buildCatalog(await JSZip.loadAsync(readFileSync(CORE_ZIP)), 'Core.zip')
  const base = buildFuzzyObstaclePools(catalog.mapObjects)
  const baseWeights = catalog.rmgEnvironmentAssets ? buildFuzzyObstacleWeights(catalog.rmgEnvironmentAssets) : undefined
  const biomes = Object.keys(BIOME_NAMES).map(Number) as BiomeId[]

  if (!process.argv.includes('--mixed')) {
    for (const biome of biomes) {
      console.log(`\n== ${BIOME_NAMES[biome]}`)
      for (const list of LISTS) {
        const groups = new Map<string, string[]>()
        for (const sid of base[biome][list]) {
          const { type, variant, num } = parseDecorationSid(sid)
          const key = `${type} | ${variant || '-'}`
          groups.set(key, [...(groups.get(key) ?? []), num === undefined ? '(none)' : String(num)])
        }
        for (const key of [...groups.keys()].sort()) console.log(`  ${list} | ${key}: ${groups.get(key)!.join(',')}`)
      }
    }
    return
  }

  const mixed = applyBiomeDecorationMix(base, baseWeights)
  for (const biome of biomes) {
    console.log(`\n== ${BIOME_NAMES[biome]}`)
    for (const list of LISTS) {
      const own = new Set(base[biome][list])
      const weight = (sid: string) => mixed.weights?.[biome]?.[sid] ?? (mixed.weights?.[biome] ? 0 : 1)
      const sids = mixed.pools[biome][list]
      const total = sids.reduce((sum, sid) => sum + weight(sid), 0)
      const foreign = sids.filter((sid) => !own.has(sid))
      const removed = [...own].filter((sid) => !sids.includes(sid))
      if (foreign.length === 0 && removed.length === 0) continue
      const share = total > 0 ? foreign.reduce((sum, sid) => sum + weight(sid), 0) / total : 0
      console.log(`  ${list}: borrowed ${(share * 100).toFixed(1)}% of picks`)
      if (foreign.length > 0) console.log(`    + ${foreign.join(', ')}`)
      if (removed.length > 0) console.log(`    - ${removed.join(', ')}`)
    }
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
