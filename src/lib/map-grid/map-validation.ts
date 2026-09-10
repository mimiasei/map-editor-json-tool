// ─── Map Grid — combined save-time validation ───────────────────────────────
// One small orchestrator over the independent checks below, so the store/
// dialog only ever deal with one heterogeneous issue list rather than two
// parallel ones. Each check stays single-purpose and independently testable.

import type { MapContext } from '@/types/map-context'
import type { GameCatalog } from '@/lib/catalog/types'
import { findOutOfBoundsPlacements, type OutOfBoundsPlacement } from './bounds-validation'
import { findBlockedEntrancePlacements, type BlockedEntrancePlacement } from './entrance-validation'

export type MapValidationIssue =
  | ({ kind: 'outOfBounds' } & OutOfBoundsPlacement)
  | ({ kind: 'blockedEntrance' } & BlockedEntrancePlacement)

type MapValidationContext = Pick<MapContext, 'sizeX' | 'sizeZ' | 'placedObjects' | 'levelsMap' | 'climbsMap' | 'waterMap'>

export function findMapValidationIssues(context: MapValidationContext, catalog: GameCatalog | null): MapValidationIssue[] {
  return [
    ...findOutOfBoundsPlacements(context, catalog).map((v) => ({ kind: 'outOfBounds' as const, ...v })),
    ...findBlockedEntrancePlacements(context, catalog).map((v) => ({ kind: 'blockedEntrance' as const, ...v })),
  ]
}

export function describeMapValidationIssue(issue: MapValidationIssue): string {
    const where = `${issue.sid} (id ${issue.id}) at (${issue.x}, ${issue.z})`
    return issue.kind === 'outOfBounds'
        ? `${where} — extends past the map's edge`
        : `${where} — entrance is fully blocked (can't be reached)`
}
