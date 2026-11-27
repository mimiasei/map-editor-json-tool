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
import type { H3ImportReport } from './convert-h3m-to-map'
import { reportH3Stage, stageLabel, type H3ImportProgress, type H3ImportStage } from './import-progress'
import { runH3ImportJob, type H3ImportJobInput, type H3ImportJobResult } from './h3-import-job'
import type { H3WorkerMessage } from './h3-import.worker'
import type { UnreachablePlacement, IsolatedPlayerStart } from '@/lib/map-grid/reachability-validation'
import i18n from '@/lib/i18n'
import { useH3MappingStore } from '@/store/useH3MappingStore'

export interface ImportH3mResult {
  /** Display name for the freshly-imported map, e.g. "Crimson and Clover.map" */
  name: string
  report: H3ImportReport
  /** Structural validator findings (Phase 5) against the converted output —
   *  surfaced so a real gap in this round's simplified conversion is always
   *  visible, never silently produced as a "looks fine" map. */
  validationErrors: string[]
  autoFixWarnings: string[]
  /** Whole-map reachability validation (reachability-validation.ts), read
   *  LAST — after runPlacementAutoFix's own bounds/entrance/reachability
   *  auto-fix rounds — over every interactable/resource/squad placement
   *  (fixed squads[] included, unlike convertH3mToMap's own mid-conversion
   *  accessibility pass, which never checks those). Only ever reports what
   *  the reachability auto-fix round (portal-aware; deletes/relocates
   *  decorative or pickable blockers, relocates the target itself as a last
   *  resort) couldn't safely resolve — a real, disclosed gap, not a
   *  pre-fix snapshot. */
  unreachablePlacements: UnreachablePlacement[]
  /** Isolated player starts (reachability-validation.ts's own separate
   *  check, merged-reachability's blind spot — see its header comment):
   *  two players' zones can each be internally fine yet mutually
   *  disconnected, which unreachablePlacements alone would never catch.
   *  Never auto-fixable. Real risk for an H3 conversion specifically —
   *  a source map's own connectivity (bridges/roads spanning terrain this
   *  importer doesn't fully preserve) can be lost in translation. */
  isolatedPlayerStarts: IsolatedPlayerStart[]
}

/** Runs the job in a module Web Worker; falls back to running it in-line (a frozen UI, but a working import) if the worker cannot start. */
function runH3ImportJobOffThread(input: H3ImportJobInput, onProgress?: H3ImportProgress): Promise<H3ImportJobResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./h3-import.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      runH3ImportJob(input, onProgress).then(resolve, reject)
      return
    }
    let started = false
    worker.onmessage = (event: MessageEvent<H3WorkerMessage>) => {
      started = true
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.(stageLabel(message.stage as H3ImportStage), message.pct, message.stage as H3ImportStage)
        return
      }
      worker.terminate()
      if (message.type === 'done') resolve(message.result)
      else reject(new Error(message.message))
    }
    worker.onerror = (event) => {
      worker.terminate()
      if (started) reject(new Error(event.message || 'The H3 import worker failed.'))
      else runH3ImportJob(input, onProgress).then(resolve, reject)
    }
    worker.postMessage(input)
  })
}

/**
 * Prompts for a .h3m file, converts it, and loads the result as the current
 * in-memory map document. Returns null if the user cancels the file picker
 * or isn't running in Tauri. Throws on a genuine conversion failure (an
 * unsupported/malformed H3M, or no Game Data catalog loaded yet) — the
 * caller (ImportH3mDialog) is expected to catch and display this.
 */
export async function importH3mFile(onProgress?: H3ImportProgress): Promise<ImportH3mResult | null> {
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

  // The conversion, the placement auto-fix and the validations run in a Web Worker (h3-import-job.ts), so the dialog's text, bar and spinner stay live.
  const {
    container: fixed, report, localizationTokens, customMapObjects, dialogFlows, validationErrors, autoFixWarnings, unreachablePlacements, isolatedPlayerStarts,
  } = await runH3ImportJobOffThread({ data, catalog, template: templateContainer, mapName: file.name.replace(/.h3m$/i, ''), language: i18n.language, mappingEdits: useH3MappingStore.getState().edits }, onProgress)
  // The map loads with the converter's custom map objects (the subterranean gates) in the catalog: clones of real ones under a new sid the game's
  // catalog does not list, same footprint as the source, the clone's own name.
  const importCatalog = customMapObjects.length === 0 ? catalog : {
    ...catalog,
    mapObjects: [...catalog.mapObjects, ...customMapObjects.flatMap((custom) => {
      const source = catalog.mapObjects.find((o) => o.id === custom.sourceObjectId)
      return source ? [{ ...source, id: custom.id, name: 'Subterranean Gate', raw: custom.template }] : []
    })],
  }
  const stage = (key: H3ImportStage, pct: number) => reportH3Stage(onProgress, key, pct)

  const gzipped = await gzipBytes(buildMapContainer(fixed))
  const buffer = gzipped.buffer.slice(gzipped.byteOffset, gzipped.byteOffset + gzipped.byteLength) as ArrayBuffer

  const stem = file.name.replace(/\.h3m$/i, '')
  const name = `${stem}.map`
  await stage('loading', 96)
  if (importCatalog !== catalog) useCatalogStore.setState({ catalog: importCatalog })
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
  // The custom map objects ship in the publish zip (zip-export.ts); loading the map above reset the scenario, so they are registered after it.
  for (const custom of customMapObjects) useScenarioStore.getState().setCustomMapObject(custom.id, custom)
  // Same for dialog flows built from H3 global timed events (the "day 1"
  // map-opening message, etc.) — no bulk setter exists for these, so loop.
  for (const flow of Object.values(dialogFlows)) {
    useScenarioStore.getState().setDialogFlow(flow.id, flow)
  }

  await stage('done', 100)
  return { name, report, validationErrors, autoFixWarnings, unreachablePlacements, isolatedPlayerStarts }
}
