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
export async function generateRandomMapFile(options: GenerateRandomMapFileOptions): Promise<(OpenMapResult & { balanceReport: BalanceReport; unreachablePlacements: UnreachablePlacement[]; isolatedPlayerStarts: IsolatedPlayerStart[] }) | null> {
  if (!isTauri()) return null
  const catalog = useCatalogStore.getState().catalog
  if (!catalog) throw new Error('Load Game Data first (More → Game Data) so map objects can be resolved.')

  const loaded = await readTemplateAndCatalog()
  if (!loaded) return null
  const { container, balanceReport } = generateRandomMap(loaded.template, catalog, options)

  const { fixed, warnings: autoFixWarnings } = runPlacementAutoFix(container, catalog)

  // Whole-map reachability validation (reachability-validation.ts) —
  // runPlacementAutoFix above already ran its own reachability auto-fix
  // round (portal-aware; deletes/relocates decorative or pickable blockers,
  // relocates the target itself as a last resort), so this final read-only
  // pass only ever reports what THAT couldn't safely resolve — a real,
  // disclosed gap in the generated map, not a pre-fix snapshot.
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

  const gzipped = await gzipBytes(buildMapContainer(fixed))
  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer

  const name = options.mapName.endsWith('.map') ? options.mapName : `${options.mapName}.map`
  const result = await loadParsedMapFile(name, null, buffer)
  // Same reasoning as createNewMap(): a generated map has nowhere on disk
  // yet, so the dirty-dot/exit-guard must reflect that immediately.
  useMapDocumentStore.setState({ mapIsDirty: true })
  return { ...result, warnings: [...autoFixWarnings, ...result.warnings], balanceReport, unreachablePlacements, isolatedPlayerStarts }
}
