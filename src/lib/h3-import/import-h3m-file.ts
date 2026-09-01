// ─── "Import H3 Map" orchestration (issue #207 Phase 6) ──────────────────────
// Ties together: pick a .h3m file → decompress if needed → convertH3mToMap
// (using the app's already-loaded GameCatalog and the bundled blank-map
// template resource, exactly like create-map.ts loads it for "New Map") →
// validate the result (validate-map.ts, Phase 5) → load it into the app
// through the exact same path Import Map/New Map use (loadParsedMapFile),
// so the freshly-converted map becomes the current in-memory document with
// no file path yet — the first real Save/Save As is a normal, unmodified
// Save As, matching the roadmap's own "reuse the existing save flow
// entirely" goal. Tauri-only — needs real filesystem read access for both
// the .h3m picker and the bundled template resource.

import { isTauri, openH3mFile, readBinaryFile } from '@/lib/native-fs'
import { readMapContainer, buildMapContainer, gzipBytes, gunzipBytes } from '@/lib/map-write'
import { loadParsedMapFile } from '@/lib/map-file'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { gunzipH3mIfNeeded } from './parse-h3m'
import { convertH3mToMap, type H3ImportReport } from './convert-h3m-to-map'
import { validateMapStructure } from '@/lib/map-grid/validate-map'

export interface ImportH3mResult {
  /** Display name for the freshly-imported map, e.g. "Crimson and Clover.map" */
  name: string
  report: H3ImportReport
  /** Structural validator findings (Phase 5) against the converted output —
   *  surfaced so a real gap in this round's simplified conversion is always
   *  visible, never silently produced as a "looks fine" map. */
  validationErrors: string[]
}

/**
 * Prompts for a .h3m file, converts it, and loads the result as the current
 * in-memory map document. Returns null if the user cancels the file picker
 * or isn't running in Tauri. Throws on a genuine conversion failure (an
 * unsupported/malformed H3M, or no Game Data catalog loaded yet) — the
 * caller (ImportH3mDialog) is expected to catch and display this.
 */
export async function importH3mFile(): Promise<ImportH3mResult | null> {
  if (!isTauri()) return null

  const catalog = useCatalogStore.getState().catalog
  if (!catalog) throw new Error('Load Game Data first (More → Game Data) so scenery/objects can be resolved.')

  const file = await openH3mFile()
  if (!file) return null

  const rawBytes = new Uint8Array(file.buffer)
  const data = gunzipH3mIfNeeded(rawBytes) ? await gunzipBytes(rawBytes) : rawBytes

  const { resourceDir, join } = await import('@tauri-apps/api/path')
  // Same bundled resource "New Map" reads from — see create-map.ts's own
  // doc comment for why the path is built this way.
  const templatePath = await join(await resourceDir(), 'resources', 'template.map')
  const templateBuffer = await readBinaryFile(templatePath)
  if (!templateBuffer) throw new Error(`Could not read the blank-map template at "${templatePath}"`)
  const templateContainer = readMapContainer(await gunzipBytes(new Uint8Array(templateBuffer)))

  const { container, report, localizationTokens, dialogFlows } = convertH3mToMap(data, catalog, templateContainer)

  const decoder = new TextDecoder('utf-8')
  const b1 = JSON.parse(decoder.decode(container.chunks[0])) as Record<string, unknown>
  const b2 = JSON.parse(decoder.decode(container.chunks[1])) as Record<string, unknown>
  const { errors: validationErrors } = validateMapStructure(b1, b2)

  const gzipped = await gzipBytes(buildMapContainer(container))
  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer

  const stem = file.name.replace(/\.h3m$/i, '')
  const name = `${stem}.map`
  await loadParsedMapFile(name, null, buffer)
  // A converted map has nowhere on disk yet — same reasoning as
  // create-map.ts's own createNewMap(): the dirty-dot/exit-guard must
  // reflect that immediately rather than only after the user's first edit.
  useMapDocumentStore.setState({ mapIsDirty: true })
  // Register every generated display-name SID's real text (custom H3 town
  // names — see convertH3mToMap's own H3ImportResult doc comment) into the
  // live scenario's localization store, same mechanism SetDisplayNameDialog
  // uses. Skipped entirely when empty so a map with no custom-named towns
  // doesn't get needlessly flagged dirty.
  if (Object.keys(localizationTokens).length > 0) {
    useScenarioStore.getState().setLocalizationBatch(localizationTokens)
  }
  // Same for dialog flows built from H3 global timed events (the "day 1"
  // map-opening message, etc.) — no bulk setter exists for these, so loop.
  for (const flow of Object.values(dialogFlows)) {
    useScenarioStore.getState().setDialogFlow(flow.id, flow)
  }

  return { name, report, validationErrors }
}
