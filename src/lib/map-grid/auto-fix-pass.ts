// ─── Shared placement auto-fix pass (bounds + entrance) ─────────────────────
// The bounds-then-entrance auto-fix sequence used by both "Generate Random
// Map" (rmg/generate-map-file.ts) and "Import H3 Map" (h3-import/import-h3m-
// file.ts) — extracted here once both call sites needed the exact same
// sequence, not speculatively.

import type { MapContainer } from '@/lib/map-write'
import type { GameCatalog } from '@/lib/catalog/types'
import { applyMapEdit } from '@/lib/map-save'
import { extractMapContext } from '@/lib/map-extract'
import { containerToRawBlocks } from '@/store/useMapDocumentStore'
import { computeBoundsAutoFix } from './bounds-autofix'
import { computeEntranceAutoFix } from './entrance-autofix'
import { findMapValidationIssues, describeMapValidationIssue } from './map-validation'

export interface PlacementAutoFixResult {
  fixed: MapContainer
  warnings: string[]
}

export function runPlacementAutoFix(container: MapContainer, catalog: GameCatalog | null): PlacementAutoFixResult {
  let fixed = container
  const boundsCtx = extractMapContext(containerToRawBlocks(fixed))
  const bounds = computeBoundsAutoFix(boundsCtx, catalog)
  for (const fix of bounds.fixes) {
    fixed = applyMapEdit(fixed, { kind: 'moveObject', entityType: 0, entityId: fix.id, newNode: fix.toNode }).container
  }
  const entranceCtx = extractMapContext(containerToRawBlocks(fixed))
  const entrance = computeEntranceAutoFix(entranceCtx, catalog)
  for (const del of entrance.deletions) {
    fixed = applyMapEdit(fixed, { kind: 'deleteObject', entityType: 0, entityId: del.id }).container
  }
  for (const rel of entrance.relocations) {
    fixed = applyMapEdit(fixed, { kind: 'moveObject', entityType: 0, entityId: rel.id, newNode: rel.toNode }).container
  }

  const remaining = findMapValidationIssues(extractMapContext(containerToRawBlocks(fixed)), catalog)
  const warnings: string[] = []
  const fixedCount = bounds.fixes.length + entrance.deletions.length + entrance.relocations.length
  if (fixedCount > 0) warnings.push(`Auto-fixed ${fixedCount} placement issue(s).`)
  for (const issue of remaining) {
    warnings.push(`Unresolved: ${describeMapValidationIssue(issue)}`)
  }

  return { fixed, warnings }
}
