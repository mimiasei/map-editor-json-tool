// ─── "Create New Map" orchestration ───────────────────────────────────────────
// Ties together: read the bundled blank-map template resource → build a
// fresh container (buildBlankMap, map-write.ts) → load it in-memory through
// the exact same path Import Map uses (loadParsedMapFile, map-file.ts), so
// the rest of the app treats a freshly-created map no differently from one
// just opened — except it has no file path yet. Deliberately does NOT
// prompt for or write to a save location here — the user can work on a new
// map entirely in-memory; the first real Save (or Save As) is what prompts
// for a path, exactly like any other never-saved document (see
// commitMapWithPathPrompt in map-file.ts). Tauri-only — needs real
// filesystem read access for the template resource; there is no equivalent
// for the web build.

import { isTauri, readBinaryFile } from '@/lib/native-fs'
import { readMapContainer, buildMapContainer, gzipBytes, gunzipBytes, buildBlankMap, type BlankMapPlayer } from '@/lib/map-write'
import { loadParsedMapFile, type OpenMapResult } from '@/lib/map-file'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'

export interface CreateNewMapOptions {
  mapName: string
  sizeX: number
  sizeZ: number
  /** Biome id 1-7 (BIOME_NAMES in terrain-colors.ts). */
  biomeId: number
  players: BlankMapPlayer[]
}

/**
 * Build a brand-new blank .map document in memory and load it into the app
 * exactly like Import Map would — with no file path yet. Returns null only
 * when not running in Tauri (no write access at all in the web build, and
 * the template resource itself needs real filesystem read access even
 * though nothing is written here).
 */
export async function createNewMap(options: CreateNewMapOptions): Promise<OpenMapResult | null> {
  if (!isTauri()) return null

  const { resourceDir, join } = await import('@tauri-apps/api/path')
  // Tauri preserves the declared resource's original directory structure
  // under $RESOURCE (tauri.conf.json's "resources/template.map" entry ->
  // $RESOURCE/resources/template.map) — confirmed against a real dev build,
  // where the file lands at src-tauri/target/debug/resources/template.map.
  const templatePath = await join(await resourceDir(), 'resources', 'template.map')
  const templateBuffer = await readBinaryFile(templatePath)
  if (!templateBuffer) throw new Error(`Could not read the blank-map template at "${templatePath}"`)

  const templateContainer = readMapContainer(await gunzipBytes(new Uint8Array(templateBuffer)))

  const container = buildBlankMap(templateContainer, {
    sizeX: options.sizeX,
    sizeZ: options.sizeZ,
    biomeId: options.biomeId,
    players: options.players,
  })
  const gzipped = await gzipBytes(buildMapContainer(container))
  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer

  const name = options.mapName.endsWith('.map') ? options.mapName : `${options.mapName}.map`
  const result = await loadParsedMapFile(name, null, buffer)
  // A brand-new map has nowhere on disk yet — unlike opening a real file
  // (where loadParsedMapFile's own markClean() correctly means "nothing
  // changed since disk"), this needs saving somewhere, so the dirty-dot/
  // exit-guard must reflect that immediately rather than only after the
  // user's first edit.
  useMapDocumentStore.setState({ mapIsDirty: true })
  return result
}
