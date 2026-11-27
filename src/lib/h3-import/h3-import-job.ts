// ─── The heavy part of an H3 import, runnable off the main thread ────────────
// Converting a large map and fixing its placements is minutes of synchronous work in total (checked on [HotA] Barren Lands: about a minute even after
// the relocation search was bounded). On the main thread that froze the status text, the bar and the spinner for the whole stretch, whatever
// the code did to repaint between stages. This runs in a Web Worker (h3-import.worker.ts), so the dialog stays live, and in-line as the fallback.
// Everything here is plain data in and out (structured clone): no stores, no DOM.

import type { GameCatalog } from '@/lib/catalog/types'
import type { MapContainer } from '@/lib/map-write'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { DialogFlow } from '@/types/dialog'
import i18n from '@/lib/i18n'
import { convertH3mToMap, type H3ImportReport } from './convert-h3m-to-map'
import { applyMappingOverrides, type MappingOverrides } from './h3-object-mapping'
import { reportH3Stage, stageLabel, type H3ImportProgress } from './import-progress'
import { validateMapStructure } from '@/lib/map-grid/validate-map'
import { runPlacementAutoFix } from '@/lib/map-grid/auto-fix-pass'
import { extractMapContext } from '@/lib/map-extract'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { findUnreachablePlacements, findIsolatedPlayerStarts, type UnreachablePlacement, type IsolatedPlayerStart } from '@/lib/map-grid/reachability-validation'

export interface H3ImportJobInput {
  data: Uint8Array
  catalog: GameCatalog
  template: MapContainer
  /** The .h3m file name without its extension (prefixes every dialog and text id the import writes). */
  mapName: string
  /** The UI language, so the auto-fix warnings are written in it. */
  language: string
  /** The user's edits to the object mapping table (the mapping tool): the worker has its own copy of the table, so they travel with the job. */
  mappingOverrides: MappingOverrides
}

export interface H3ImportJobResult {
  container: MapContainer
  report: H3ImportReport
  localizationTokens: Record<string, string>
  customMapObjects: CustomMapObjectDefinition[]
  dialogFlows: Record<string, DialogFlow>
  validationErrors: string[]
  autoFixWarnings: string[]
  unreachablePlacements: UnreachablePlacement[]
  isolatedPlayerStarts: IsolatedPlayerStart[]
}

export async function runH3ImportJob(input: H3ImportJobInput, onProgress?: H3ImportProgress): Promise<H3ImportJobResult> {
  if (i18n.language !== input.language) await i18n.changeLanguage(input.language)
  applyMappingOverrides(input.mappingOverrides)
  const { container, report, localizationTokens, customMapObjects, dialogFlows, sealIds, forbiddenNodes } =
    await convertH3mToMap(input.data, input.catalog, input.template, undefined, onProgress, input.mapName)
  // The converter's custom map objects (the subterranean gates) are clones of real ones under a new sid the game's catalog does not list, so the
  // passes below get the catalog with those clones added: same footprint as the source, the clone's own name.
  const importCatalog: GameCatalog = customMapObjects.length === 0 ? input.catalog : {
    ...input.catalog,
    mapObjects: [...input.catalog.mapObjects, ...customMapObjects.flatMap((custom) => {
      const source = input.catalog.mapObjects.find((o) => o.id === custom.sourceObjectId)
      return source ? [{ ...source, id: custom.id, name: 'Subterranean Gate', raw: custom.template }] : []
    })],
  }
  // The cave rocks that close thin H3 walls stay (deleting or moving one opens a hole H3 does not have), and no elevation repaint: the
  // converter's levels are H3's rock and floor, and a lone rock tile is real H3 data (the spike fix would raise the floor tile it encloses).
  await reportH3Stage(onProgress, 'fixing', 78)
  const sealed = new Set(sealIds)
  const { fixed, warnings: autoFixWarnings } = runPlacementAutoFix(container, importCatalog, {
    mayChange: (entityType, id) => !(entityType === 0 && sealed.has(id)),
    fixElevation: false,
    forbiddenNodes,
    // The auto-fix is the longest stretch (about a minute on a large map): its own progress fills the 78-90 range of the bar.
    onProgress: (fraction) => onProgress?.(stageLabel('fixing'), 78 + 12 * fraction, 'fixing'),
  })

  await reportH3Stage(onProgress, 'validating', 90)
  const finalContext = extractMapContext(containerToRawBlocks(fixed))
  const unreachablePlacements = findUnreachablePlacements(finalContext, importCatalog)
  const isolatedPlayerStarts = findIsolatedPlayerStarts(finalContext, importCatalog)

  const decoder = new TextDecoder('utf-8')
  const b1 = JSON.parse(decoder.decode(fixed.chunks[0])) as Record<string, unknown>
  const b2 = JSON.parse(decoder.decode(fixed.chunks[1])) as Record<string, unknown>
  const { errors: validationErrors } = validateMapStructure(b1, b2)

  return { container: fixed, report, localizationTokens, customMapObjects, dialogFlows, validationErrors, autoFixWarnings, unreachablePlacements, isolatedPlayerStarts }
}
