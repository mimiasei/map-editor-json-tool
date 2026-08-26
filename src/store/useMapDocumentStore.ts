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

interface MapDocumentStore {
  container: MapContainer | null
  mapIsDirty: boolean
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
  /** Persist the current in-memory document to `mapFilePath` and clear
   *  mapIsDirty on success. */
  commitToDisk: (mapFilePath: string) => Promise<MapSaveResult>
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
        const result = await writeMapChunks(mapFilePath, current)
        set({ mapIsDirty: false })
        return result
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
