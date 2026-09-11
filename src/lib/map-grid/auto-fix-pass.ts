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

// A single entrance-autofix pass computes every relocation target against
// one static snapshot of the map, so two DIFFERENT violations resolved in
// the same call can end up relying on each other's now-stale state (e.g.
// one violation's relocation destination lands under a second violation's
// own about-to-be-decided relocation's new footprint) — confirmed via a
// real H3 import (Ville'de'Porte.h3m, 2026-09-11): human_city (id 1900)'s
// own self-relocation (to satisfy its OWN blocked entrance) landed a solid
// footprint cell on portal_3 (id 670)'s approach ring, a conflict neither
// violation's own candidate search could see in a single pass since each
// only knows about decisions made EARLIER in that same pass, never later
// ones. Re-running entrance-autofix against the freshly-updated state until
// a pass makes no further changes catches exactly this, matching how a
// human re-checking the map after every edit would. Capped rather than
// unbounded — a real map has always converged in 2-3 passes in testing, and
// a hard cap guarantees this can never loop forever even for some
// pathological oscillating case that hasn't been seen yet.
const MAX_ENTRANCE_AUTOFIX_PASSES = 5

export function runPlacementAutoFix(container: MapContainer, catalog: GameCatalog | null): PlacementAutoFixResult {
  let fixed = container
  const boundsCtx = extractMapContext(containerToRawBlocks(fixed))
  const bounds = computeBoundsAutoFix(boundsCtx, catalog)
  for (const fix of bounds.fixes) {
    fixed = applyMapEdit(fixed, { kind: 'moveObject', entityType: 0, entityId: fix.id, newNode: fix.toNode }).container
  }

  let entranceFixCount = 0
  for (let pass = 0; pass < MAX_ENTRANCE_AUTOFIX_PASSES; pass++) {
    const entranceCtx = extractMapContext(containerToRawBlocks(fixed))
    const entrance = computeEntranceAutoFix(entranceCtx, catalog)
    if (entrance.deletions.length === 0 && entrance.relocations.length === 0) break
    for (const del of entrance.deletions) {
      fixed = applyMapEdit(fixed, { kind: 'deleteObject', entityType: 0, entityId: del.id }).container
    }
    for (const rel of entrance.relocations) {
      fixed = applyMapEdit(fixed, { kind: 'moveObject', entityType: 0, entityId: rel.id, newNode: rel.toNode }).container
    }
    entranceFixCount += entrance.deletions.length + entrance.relocations.length
  }

  const remaining = findMapValidationIssues(extractMapContext(containerToRawBlocks(fixed)), catalog)
  const warnings: string[] = []
  const fixedCount = bounds.fixes.length + entranceFixCount
  if (fixedCount > 0) warnings.push(`Auto-fixed ${fixedCount} placement issue(s).`)
  for (const issue of remaining) {
    warnings.push(`Unresolved: ${describeMapValidationIssue(issue)}`)
  }

  return { fixed, warnings }
}
