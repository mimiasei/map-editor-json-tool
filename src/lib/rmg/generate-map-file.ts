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
import { readMapContainer, buildMapContainer, gzipBytes, gunzipBytes } from '@/lib/map-write'
import { loadParsedMapFile, type OpenMapResult } from '@/lib/map-file'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { generateRandomMap, type GenerateRandomMapOptions } from './generate-random-map'

export interface GenerateRandomMapFileOptions extends GenerateRandomMapOptions {
  mapName: string
}

/**
 * Build a brand-new random `.map` document in memory and load it into the
 * app exactly like Import Map/New Map would — with no file path yet.
 * Returns null only when not running in Tauri.
 */
export async function generateRandomMapFile(options: GenerateRandomMapFileOptions): Promise<OpenMapResult | null> {
  if (!isTauri()) return null

  const catalog = useCatalogStore.getState().catalog
  if (!catalog) throw new Error('Load Game Data first (More → Game Data) so map objects can be resolved.')

  const { resourceDir, join } = await import('@tauri-apps/api/path')
  const templatePath = await join(await resourceDir(), 'resources', 'template.map')
  const templateBuffer = await readBinaryFile(templatePath)
  if (!templateBuffer) throw new Error(`Could not read the blank-map template at "${templatePath}"`)
  const templateContainer = readMapContainer(await gunzipBytes(new Uint8Array(templateBuffer)))

  const container = generateRandomMap(templateContainer, catalog, options)
  const gzipped = await gzipBytes(buildMapContainer(container))
  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer

  const name = options.mapName.endsWith('.map') ? options.mapName : `${options.mapName}.map`
  const result = await loadParsedMapFile(name, null, buffer)
  // Same reasoning as createNewMap(): a generated map has nowhere on disk
  // yet, so the dirty-dot/exit-guard must reflect that immediately.
  useMapDocumentStore.setState({ mapIsDirty: true })
  return result
}
