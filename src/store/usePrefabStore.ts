import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ObjectClipboard } from '@/lib/map-grid/clipboard'
import { cleanPrefabList, newPrefabId, type Prefab } from '@/lib/map-grid/prefab-library'

// The user's saved object groups (Map Grid > Library). Persisted in localStorage; a stored list is re-validated on load.
interface PrefabState {
  prefabs: Prefab[]
  add: (name: string, clip: ObjectClipboard) => void
  remove: (id: string) => void
  /** Adds imported prefabs under fresh ids, so importing the same file twice never overwrites a prefab. */
  addMany: (imported: Prefab[]) => void
}

export const usePrefabStore = create<PrefabState>()(
  persist(
    (set) => ({
      prefabs: [],
      add: (name, clip) => set((s) => ({ prefabs: [{ id: newPrefabId(), name: name.trim().slice(0, 80) || 'Prefab', savedAt: Date.now(), clip }, ...s.prefabs] })),
      remove: (id) => set((s) => ({ prefabs: s.prefabs.filter((p) => p.id !== id) })),
      addMany: (imported) => set((s) => ({ prefabs: [...imported.map((p) => ({ ...p, id: newPrefabId() })), ...s.prefabs] })),
    }),
    {
      name: 'oe-prefab-library',
      version: 1,
      partialize: (s) => ({ prefabs: s.prefabs }),
      merge: (stored, current) => ({ ...current, prefabs: cleanPrefabList((stored as { prefabs?: unknown } | undefined)?.prefabs) }),
    },
  ),
)
