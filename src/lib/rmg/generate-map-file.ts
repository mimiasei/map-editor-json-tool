// ─── "Generate Random Map" orchestration (issue #210, Milestone 1) ─────────
// Same shape as create-map.ts's createNewMap()/h3-import's importH3mFile():
// read the bundled blank-map template resource → build a fresh container
// (generateRandomMap) → load it in-memory through the exact same path Import
// Map/New Map/Import H3 Map all use (loadParsedMapFile), so the rest of the
// app treats a freshly-generated map no differently from one just opened —
// except it has no file path yet. Tauri-only, for the same reason
// create-map.ts is: needs real filesystem read access for the template
// resource. Also needs a loaded GameCatalog (same requirement as Import H3
// Map) — Milestone 1's zone population places real catalog objects
// (mines/dwellings) and needs their real footprints to avoid overlap.

import { isTauri, readBinaryFile } from '@/lib/native-fs'
import { readMapContainer, buildMapContainer, gzipBytes, gunzipBytes, type MapContainer } from '@/lib/map-write'
import { loadParsedMapFile, type OpenMapResult } from '@/lib/map-file'
import { useMapDocumentStore, containerToRawBlocks } from '@/store/useMapDocumentStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { generateRandomMap, type GenerateRandomMapOptions } from './generate-random-map'
import type { BalanceReport } from './balance-analyzer'
import { generateTerrain, type GenerateTerrainOptions, type TerrainResult } from './generate-terrain'
import { runPlacementAutoFix } from '@/lib/map-grid/auto-fix-pass'
import { extractMapContext } from '@/lib/map-extract'
import { findUnreachablePlacements, findIsolatedPlayerStarts, type UnreachablePlacement, type IsolatedPlayerStart } from '@/lib/map-grid/reachability-validation'
import { yieldToUI } from '@/lib/async-utils'
import { computePlayerBalance, type PlayerBalance } from '@/lib/map-grid/player-balance'

/** A generation scoring below this is re-rolled (up to `MAX_BALANCE_ATTEMPTS`
 *  total); the best-scoring attempt wins. */
const BALANCE_TARGET_SCORE = 85
const MAX_BALANCE_ATTEMPTS = 4

export interface GenerateRandomMapFileOptions extends GenerateRandomMapOptions {
  mapName: string
}

/** Reads the same bundled `template.map`/loaded-catalog pair
 *  `generateRandomMapFile` itself reads, for callers (the live-preview
 *  dialog) that need it without going through a full generation — kept
 *  here rather than in `generate-terrain.ts` so that file stays
 *  environment-agnostic (no Tauri fs, no store access), matching this
 *  file's own existing role as the Tauri/store orchestration layer. */
async function readTemplateAndCatalog(): Promise<{ template: MapContainer; catalogById: Map<string, import('@/lib/catalog/types').CatalogMapObject> } | null> {
  if (!isTauri()) return null
  const catalog = useCatalogStore.getState().catalog
  if (!catalog) throw new Error('Load Game Data first (More → Game Data) so map objects can be resolved.')

  const { resourceDir, join } = await import('@tauri-apps/api/path')
  const templatePath = await join(await resourceDir(), 'resources', 'template.map')
  const templateBuffer = await readBinaryFile(templatePath)
  if (!templateBuffer) throw new Error(`Could not read the blank-map template at "${templatePath}"`)
  const template = readMapContainer(await gunzipBytes(new Uint8Array(templateBuffer)))
  const catalogById = new Map(catalog.mapObjects.map((o) => [o.id, o]))
  return { template, catalogById }
}

/**
 * Live-preview entry point (issue #210) — terrain only, no full generation.
 * Returns `null` outside Tauri, same convention as `generateRandomMapFile`.
 */
export async function previewTerrain(options: GenerateTerrainOptions): Promise<TerrainResult | null> {
  const loaded = await readTemplateAndCatalog()
  if (!loaded) return null
  return generateTerrain(loaded.template, loaded.catalogById, options)
}

/**
 * Build a brand-new random `.map` document in memory and load it into the
 * app exactly like Import Map/New Map would — with no file path yet.
 * Returns null only when not running in Tauri.
 */
export async function generateRandomMapFile(options: GenerateRandomMapFileOptions): Promise<(OpenMapResult & { balanceReport: BalanceReport; playerBalance: PlayerBalance | null; unreachablePlacements: UnreachablePlacement[]; isolatedPlayerStarts: IsolatedPlayerStart[] }) | null> {
  if (!isTauri()) return null
  const catalog = useCatalogStore.getState().catalog
  if (!catalog) throw new Error('Load Game Data first (More → Game Data) so map objects can be resolved.')

  const loaded = await readTemplateAndCatalog()
  if (!loaded) return null
  // Retry until the layout is fair (issue #254): the built-in layout is
  // already near-symmetric, but guard/content rolls and road geometry still
  // leave the odd lopsided map. A re-roll continues the same RNG stream, so a
  // seeded generation stays reproducible. An imported game template is
  // authoritative about its own (possibly asymmetric) layout — never re-rolled.
  // Progress: the first attempt fills 0-60%; each re-roll then gets its own
  // 10% slice (60-90%) with a "Rebalancing" label that names the attempt and
  // the score it is trying to beat, so a longer run reads as deliberate work
  // rather than a stalled bar.
  const reportWindow = (lo: number, hi: number, prefix: string) => (label: string, pct: number): void => {
    options.onProgress?.(`${prefix}${label}`, Math.round(lo + (pct / 100) * (hi - lo)))
  }
  // One fairness score everywhere (issue #255): the same `computePlayerBalance`
  // the Stats panel shows, measured on the finished map, decides the re-roll.
  const fairnessOf = (result: { container: MapContainer }): number =>
    computePlayerBalance(extractMapContext(containerToRawBlocks(result.container)), catalog)?.score ?? 100
  let best = await generateRandomMap(loaded.template, catalog, { ...options, onProgress: reportWindow(0, 60, '') })
  let bestScore = fairnessOf(best)
  options.onProgress?.(`Checking fairness of player zones (score ${bestScore}/100)`, 60)
  await yieldToUI()
  for (let attempt = 2; attempt <= MAX_BALANCE_ATTEMPTS && !options.gameTemplateJson && !options.terrainOnly && bestScore < BALANCE_TARGET_SCORE; attempt++) {
    const lo = 60 + (attempt - 2) * 10
    const prefix = `Rebalancing players (try ${attempt}/${MAX_BALANCE_ATTEMPTS}, best fairness ${bestScore}/100) — `
    options.onProgress?.(`${prefix}starting over`, lo)
    await yieldToUI()
    const next = await generateRandomMap(loaded.template, catalog, { ...options, onProgress: reportWindow(lo, lo + 10, prefix) })
    const nextScore = fairnessOf(next)
    if (nextScore > bestScore) { best = next; bestScore = nextScore }
  }
  options.onProgress?.('Player zones balanced', 90)
  const { container, balanceReport } = best

  options.onProgress?.('Auto-fixing overlaps and elevation', 92)
  await yieldToUI()
  const { fixed, warnings: autoFixWarnings } = runPlacementAutoFix(container, catalog, { guaranteeReachability: true })

  // Whole-map reachability validation (reachability-validation.ts) —
  // runPlacementAutoFix above already ran its own reachability auto-fix
  // round (portal-aware; deletes/relocates decorative or pickable blockers,
  // relocates the target itself as a last resort), so this final read-only
  // pass only ever reports what THAT couldn't safely resolve — a real,
  // disclosed gap in the generated map, not a pre-fix snapshot.
  options.onProgress?.('Validating final reachability', 96)
  await yieldToUI()
  const finalContext = extractMapContext(containerToRawBlocks(fixed))
  const unreachablePlacements = findUnreachablePlacements(finalContext, catalog)
  // Merged-reachability's own blind spot (see reachability-validation.ts's
  // header comment): two player starts can each have a fully populated,
  // internally-reachable zone yet be mutually disconnected from each other,
  // which findUnreachablePlacements alone would never flag. Not auto-
  // fixable (would need a real terrain/road/portal decision), so this is
  // reported alongside unreachablePlacements rather than folded into
  // runPlacementAutoFix.
  const isolatedPlayerStarts = findIsolatedPlayerStarts(finalContext, catalog)

  options.onProgress?.('Writing map file', 98)
  await yieldToUI()
  const gzipped = await gzipBytes(buildMapContainer(fixed))
  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer

  const name = options.mapName.endsWith('.map') ? options.mapName : `${options.mapName}.map`
  const result = await loadParsedMapFile(name, null, buffer)
  // Same reasoning as createNewMap(): a generated map has nowhere on disk
  // yet, so the dirty-dot/exit-guard must reflect that immediately.
  useMapDocumentStore.setState({ mapIsDirty: true })
  options.onProgress?.('Done', 100)
  const playerBalance = computePlayerBalance(finalContext, catalog)
  const balanceWarnings = playerBalance && playerBalance.score < BALANCE_TARGET_SCORE && !options.gameTemplateJson
    ? [`Player fairness ${playerBalance.score}/100 (${playerBalance.verdict})${playerBalance.reasons.length > 0 ? ` — ${playerBalance.reasons.join('; ')}` : ''}`]
    : []
  return { ...result, warnings: [...balanceWarnings, ...autoFixWarnings, ...result.warnings], balanceReport, playerBalance, unreachablePlacements, isolatedPlayerStarts }
}
