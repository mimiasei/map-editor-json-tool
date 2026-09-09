// ─── In-memory .map document (issue #195 follow-up) ─────────────────────────
// Holds the currently-open .map's container (header + chunks) entirely in
// memory, mirroring how useScenarioStore already holds the JSON scenario
// document — every edit applies directly here via applyEdit(), and nothing
// touches disk until an explicit commitToDisk() (the app's unified Save).
// Undo/redo is zundo temporal() over `container`, same `limit: 100`
// convention useScenarioStore's own temporal() already uses, and the same
// `store.temporal.getState().clear()` self-reference pattern
// useScenarioStore's setScenario/resetScenario already establish for
// resetting history on a fresh load.

import { create } from 'zustand'
import { temporal } from 'zundo'
import { applyMapEdit, writeMapChunks, type MapSaveEdit, type MapSaveResult } from '@/lib/map-save'
import type { MapContainer } from '@/lib/map-write'
import type { RawMapBlocks } from '@/lib/map-parser'
import { extractMapContext } from '@/lib/map-extract'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { findOutOfBoundsPlacements, type OutOfBoundsPlacement } from '@/lib/map-grid/bounds-validation'
import { computeBoundsAutoFix } from '@/lib/map-grid/bounds-autofix'

/** Cheap in-memory equivalent of parseMapFile's gzip-then-JSON-parse pass —
 *  reused here so applyEdit can re-sync useMapContextStore on every single
 *  edit without a wasteful gzip round-trip; writeMapChunks still goes
 *  through the real parseMapFile against the actual written bytes, since
 *  that's the one place "what really landed on disk" matters. Missing
 *  chunks become `{}`, matching parseMapFile's own fallback for a map that
 *  ships with fewer than 4 blocks. */
function containerToRawBlocks(container: MapContainer): RawMapBlocks {
  const decoder = new TextDecoder('utf-8')
  const parse = (i: number): unknown => {
    const chunk = container.chunks[i]
    if (!chunk) return {}
    try {
      return JSON.parse(decoder.decode(chunk))
    } catch {
      return {}
    }
  }
  return {
    block1: parse(0) as RawMapBlocks['block1'],
    block2: parse(1) as RawMapBlocks['block2'],
    block3: parse(2) as RawMapBlocks['block3'],
    block4: parse(3) as RawMapBlocks['block4'],
  }
}

/** Result of `commitToDisk` — 'blocked' means nothing was written at all
 *  (the in-memory document stays dirty) because at least one placed object's
 *  real footprint extends past the map's edge (see bounds-validation.ts).
 *  Callers must check `.status` and abort their own Save/Save As flow on
 *  'blocked', the same way they already do for a cancelled save-location
 *  prompt — showing the violation list is `boundsViolations` below's job. */
export type CommitResult = ({ status: 'saved' } & MapSaveResult) | { status: 'blocked'; violations: OutOfBoundsPlacement[] }

interface MapDocumentStore {
  container: MapContainer | null
  mapIsDirty: boolean
  /** Set by a blocked `commitToDisk` so a single, app-shell-level dialog can
   *  show the offending objects; cleared by `clearBoundsViolations`. */
  boundsViolations: OutOfBoundsPlacement[] | null
  clearBoundsViolations: () => void
  /** Relocates every current out-of-bounds violation to an in-bounds, non-
   *  colliding, reachable tile (`bounds-autofix.ts`) via the same
   *  `moveObject` edit the Map Grid's own Move tool uses — no new write
   *  path. Re-derives `boundsViolations` from the result afterward (empty
   *  if everything was fixed) so the dialog reacts the same way it already
   *  does after any other edit. Returns a summary for the dialog to show. */
  autoFixBoundsViolations: () => { fixedCount: number; unresolvedCount: number }
  /** Load a freshly-opened .map's container — resets dirty state and undo history. */
  loadContainer: (container: MapContainer) => void
  /** Apply one edit to the in-memory document. Throws (leaving the store
   *  untouched — applyMapEdit never mutates its input) if the edit's own
   *  verification fails, same contract every MapSaveEdit caller already
   *  relied on from saveMapFile. Re-syncs useMapContextStore immediately so
   *  every render (grid icons, info panel) reflects the edit, full-
   *  fidelity, with no staging/preview-merge layer needed anywhere — the
   *  document itself now *is* the current state. Returns the id an
   *  'addObject'/'addMarker' edit allocated, if any. */
  applyEdit: (edit: MapSaveEdit) => number | undefined
  /** Persist the current in-memory document to `mapFilePath` — clears
   *  mapIsDirty on success ('saved'), leaves it untouched and sets
   *  `boundsViolations` on 'blocked' (see CommitResult). */
  commitToDisk: (mapFilePath: string) => Promise<CommitResult>
  /** Discard the loaded document without writing anything — used on New/
   *  closing a map, mirroring useMapContextStore's own clearContext(). */
  clear: () => void
  /** Step the zundo history back/forward one edit and re-sync
   *  useMapContextStore — zundo's own undo()/redo() (on
   *  `useMapDocumentStore.temporal`) mutate `container` directly, bypassing
   *  applyEdit's own re-sync, so callers should use these instead of
   *  reaching into `.temporal` themselves. */
  undo: () => void
  redo: () => void
}

export const useMapDocumentStore = create<MapDocumentStore>()(
  temporal(
    (set, get) => ({
      container: null,
      mapIsDirty: false,
      boundsViolations: null,
      clearBoundsViolations: () => set({ boundsViolations: null }),

      autoFixBoundsViolations: () => {
        const current = get().container
        if (!current) throw new Error('No .map document is currently loaded')
        const catalog = useCatalogStore.getState().catalog
        const context = extractMapContext(containerToRawBlocks(current))
        const { fixes, unresolved } = computeBoundsAutoFix(context, catalog)
        for (const fix of fixes) {
          get().applyEdit({ kind: 'moveObject', entityType: 0, entityId: fix.id, newNode: fix.toNode })
        }
        const after = get().container
        const remaining = after ? findOutOfBoundsPlacements(extractMapContext(containerToRawBlocks(after)), catalog) : unresolved
        set({ boundsViolations: remaining.length > 0 ? remaining : null })
        return { fixedCount: fixes.length, unresolvedCount: remaining.length }
      },

      loadContainer: (container) => {
        set({ container, mapIsDirty: false })
        useMapDocumentStore.temporal.getState().clear()
      },

      applyEdit: (edit) => {
        const current = get().container
        if (!current) throw new Error('No .map document is currently loaded')
        const { container: next, newId } = applyMapEdit(current, edit)
        set({ container: next, mapIsDirty: true })
        useMapContextStore.getState().setContext(extractMapContext(containerToRawBlocks(next)))
        return newId
      },

      commitToDisk: async (mapFilePath) => {
        const current = get().container
        if (!current) throw new Error('No .map document is currently loaded')
        const context = extractMapContext(containerToRawBlocks(current))
        const violations = findOutOfBoundsPlacements(context, useCatalogStore.getState().catalog)
        if (violations.length > 0) {
          set({ boundsViolations: violations })
          return { status: 'blocked', violations }
        }
        const result = await writeMapChunks(mapFilePath, current)
        set({ mapIsDirty: false, boundsViolations: null })
        return { status: 'saved', ...result }
      },

      clear: () => {
        set({ container: null, mapIsDirty: false })
        useMapDocumentStore.temporal.getState().clear()
      },

      undo: () => {
        useMapDocumentStore.temporal.getState().undo()
        const current = get().container
        if (current) useMapContextStore.getState().setContext(extractMapContext(containerToRawBlocks(current)))
        set({ mapIsDirty: useMapDocumentStore.temporal.getState().pastStates.length > 0 })
      },
      redo: () => {
        useMapDocumentStore.temporal.getState().redo()
        const current = get().container
        if (current) useMapContextStore.getState().setContext(extractMapContext(containerToRawBlocks(current)))
        set({ mapIsDirty: true })
      },
    }),
    {
      partialize: (state) => ({ container: state.container }),
      equality: (a, b) => a.container === b.container,
      limit: 100,
    },
  ),
)

/** Persist the in-memory .map document to `mapFilePath` if (and only if) it
 *  has unsaved edits — a no-op otherwise (no path known, or nothing
 *  pending). Shared by every top-level Save/Save As entry point (issue
 *  #195 follow-up: Save is unified — one action covers both the .map and
 *  the scenario JSON, instead of the .map side having its own separate
 *  save trigger inside the Map Grid). Callers must check the returned
 *  status and abort their own Save flow (skip the scenario-JSON save too)
 *  when it's 'blocked' — same as they already do for a cancelled save-
 *  location prompt — since `useMapDocumentStore`'s `boundsViolations` is
 *  already set for the app-shell-level dialog to show by the time this
 *  resolves. */
export async function commitMapIfDirty(mapFilePath: string | null): Promise<{ status: 'saved' | 'skipped' | 'blocked' }> {
  const { mapIsDirty, commitToDisk } = useMapDocumentStore.getState()
  if (mapIsDirty && mapFilePath) {
    const result = await commitToDisk(mapFilePath)
    return { status: result.status }
  }
  return { status: 'skipped' }
}
