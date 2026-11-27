import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ObjectRowSchema } from '@/lib/h3-import/h3-object-mapping-schema'
import { applyMappingOverrides, type MappingOverrides } from '@/lib/h3-import/h3-object-mapping'

// The user's edits to the H3 → OE object mapping table (the H3 Object Mapping tool). Only rows that differ from the shipped
// h3-object-mapping.json are kept, by H3 id; every resolver reads the table with these on top (applyMappingOverrides).
interface H3MappingState {
  overrides: MappingOverrides
  setOverride: (h3Id: number, row: MappingOverrides[string]) => void
  clearOverride: (h3Id: number) => void
  clearAll: () => void
  /** Replaces the overrides with the valid rows of an exported table or overrides file; returns how many rows were taken. */
  importRows: (rows: unknown[]) => number
}

export const useH3MappingStore = create<H3MappingState>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (h3Id, row) => set((s) => ({ overrides: { ...s.overrides, [String(h3Id)]: row } })),
      clearOverride: (h3Id) => set((s) => {
        const next = { ...s.overrides }
        delete next[String(h3Id)]
        return { overrides: next }
      }),
      clearAll: () => set({ overrides: {} }),
      importRows: (rows) => {
        const next: MappingOverrides = {}
        for (const raw of rows) {
          const parsed = ObjectRowSchema.safeParse(raw)
          if (parsed.success) next[String(parsed.data.h3Id)] = parsed.data
        }
        set({ overrides: next })
        return Object.keys(next).length
      },
    }),
    { name: 'tse-h3-mapping-overrides', version: 1, partialize: (s) => ({ overrides: s.overrides }) },
  ),
)

// Keep the resolvers' table in step with the store: now (persist has already read localStorage) and on every edit.
applyMappingOverrides(useH3MappingStore.getState().overrides)
useH3MappingStore.subscribe((state) => applyMappingOverrides(state.overrides))
