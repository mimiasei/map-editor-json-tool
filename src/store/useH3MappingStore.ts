import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ObjectRowSchema, SpriteRuleSchema, H3SettingsSchema, type ObjectRow, type SpriteRule, type H3Settings } from '@/lib/h3-import/h3-object-mapping-schema'
import { applyMappingEdits, NO_MAPPING_EDITS, type MappingEdits } from '@/lib/h3-import/h3-object-mapping'

// The user's edits to the H3 → OE mapping (the H3 Object Mapping tool): object rows by H3 id, the whole sprite rule list, and the converter's numbers.
// Only what differs from the shipped h3-object-mapping.json is kept; every resolver reads the shipped table with these on top (applyMappingEdits).
interface H3MappingState {
  edits: MappingEdits
  setRow: (h3Id: number, row: ObjectRow) => void
  clearRow: (h3Id: number) => void
  /** The whole sprite rule list; null goes back to the shipped one. */
  setSpriteRules: (rules: SpriteRule[] | null) => void
  setSetting: <K extends keyof H3Settings>(key: K, value: H3Settings[K] | null) => void
  clearAll: () => void
  /** Replaces the edits with the valid parts of an exported table or edits file (`objects`, `spriteRules`, `settings`); returns how many pieces were taken. */
  importEdits: (rows: unknown[], spriteRules: unknown, settings: unknown) => number
}

export const useH3MappingStore = create<H3MappingState>()(
  persist(
    (set) => ({
      edits: NO_MAPPING_EDITS,
      setRow: (h3Id, row) => set((s) => ({ edits: { ...s.edits, rows: { ...s.edits.rows, [String(h3Id)]: row } } })),
      clearRow: (h3Id) => set((s) => {
        const rows = { ...s.edits.rows }
        delete rows[String(h3Id)]
        return { edits: { ...s.edits, rows } }
      }),
      setSpriteRules: (rules) => set((s) => ({ edits: { ...s.edits, spriteRules: rules } })),
      setSetting: (key, value) => set((s) => {
        const settings = { ...s.edits.settings }
        if (value === null) delete settings[key]
        else settings[key] = value
        return { edits: { ...s.edits, settings } }
      }),
      clearAll: () => set({ edits: NO_MAPPING_EDITS }),
      importEdits: (rawRows, rawRules, rawSettings) => {
        const rows: MappingEdits['rows'] = {}
        for (const raw of rawRows) {
          const parsed = ObjectRowSchema.safeParse(raw)
          if (parsed.success) rows[String(parsed.data.h3Id)] = parsed.data
        }
        const rules = Array.isArray(rawRules) ? rawRules.flatMap((raw) => { const p = SpriteRuleSchema.safeParse(raw); return p.success ? [p.data] : [] }) : null
        const settings = H3SettingsSchema.partial().safeParse(rawSettings)
        const settingsData = settings.success ? settings.data : {}
        set({ edits: { rows, spriteRules: rules && rules.length > 0 ? rules : null, settings: settingsData as Partial<H3Settings> } })
        return Object.keys(rows).length + (rules && rules.length > 0 ? 1 : 0) + Object.keys(settingsData).length
      },
    }),
    {
      name: 'tse-h3-mapping-overrides',
      version: 2,
      partialize: (s) => ({ edits: s.edits }),
      // Version 1 kept only object rows, as `overrides`.
      migrate: (persisted, version) => {
        if (version < 2) return { edits: { ...NO_MAPPING_EDITS, rows: (persisted as { overrides?: MappingEdits['rows'] }).overrides ?? {} } }
        return persisted as { edits: MappingEdits }
      },
    },
  ),
)

// Keep the resolvers' table in step with the store: now (persist has already read localStorage) and on every edit.
applyMappingEdits(useH3MappingStore.getState().edits)
useH3MappingStore.subscribe((state) => applyMappingEdits(state.edits))
