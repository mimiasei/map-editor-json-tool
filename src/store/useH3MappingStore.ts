import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ObjectRowSchema, SpriteRuleSchema, H3SettingsSchema, DecorationRuleSchema, type ObjectRow, type SpriteRule, type H3Settings, type DecorationRuleData } from '@/lib/h3-import/h3-object-mapping-schema'
import { applyMappingEdits, NO_MAPPING_EDITS, type MappingEdits } from '@/lib/h3-import/h3-object-mapping'

// The user's edits to the H3 → OE mapping (the H3 Object Mapping tool): object rows by H3 id, the whole sprite rule list, and the converter's numbers.
// Only what differs from the shipped h3-object-mapping.json is kept; every resolver reads the shipped table with these on top (applyMappingEdits).
interface H3MappingState {
  edits: MappingEdits
  setRow: (h3Id: number, row: ObjectRow) => void
  clearRow: (h3Id: number) => void
  /** The whole sprite rule list; null goes back to the shipped one. */
  setSpriteRules: (rules: SpriteRule[] | null) => void
  /** One cell of the scenery role table (role × OE biome); null goes back to the shipped sid. */
  setRoleSid: (role: string, biome: string, sid: string | null) => void
  /** The whole biome borrowing rule list; null goes back to the shipped one. */
  setDecorationRules: (rules: DecorationRuleData[] | null) => void
  /** Replaces all edits at once (loading the saved file). */
  replaceEdits: (edits: MappingEdits) => void
  setSetting: <K extends keyof H3Settings>(key: K, value: H3Settings[K] | null) => void
  clearAll: () => void
  /** Replaces the edits with the valid parts of an exported table or edits file (`objects`, `spriteRules`, `settings`); returns how many pieces were taken. */
  importEdits: (rows: unknown[], spriteRules: unknown, settings: unknown, extra?: { sceneryRoleSids?: unknown; decorationRules?: unknown }) => number
}

/** Role → biome → sid cells of an edits file, keeping only string values. */
export function parseRoleSids(raw: unknown): MappingEdits['sceneryRoleSids'] {
  const out: MappingEdits['sceneryRoleSids'] = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [role, cells] of Object.entries(raw)) {
    if (typeof cells !== 'object' || cells === null) continue
    const kept = Object.fromEntries(Object.entries(cells).filter(([, sid]) => typeof sid === 'string' && sid.trim() !== ''))
    if (Object.keys(kept).length > 0) out[role] = kept as Record<string, string>
  }
  return out
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
      setRoleSid: (role, biome, sid) => set((s) => {
        const byRole = { ...s.edits.sceneryRoleSids }
        const cells = { ...byRole[role] }
        if (sid === null) delete cells[biome]
        else cells[biome] = sid
        if (Object.keys(cells).length === 0) delete byRole[role]
        else byRole[role] = cells
        return { edits: { ...s.edits, sceneryRoleSids: byRole } }
      }),
      setDecorationRules: (rules) => set((s) => ({ edits: { ...s.edits, decorationRules: rules } })),
      replaceEdits: (edits) => set({ edits }),
      setSetting: (key, value) => set((s) => {
        const settings = { ...s.edits.settings }
        if (value === null) delete settings[key]
        else settings[key] = value
        return { edits: { ...s.edits, settings } }
      }),
      clearAll: () => set({ edits: NO_MAPPING_EDITS }),
      importEdits: (rawRows, rawRules, rawSettings, extra = {}) => {
        const rows: MappingEdits['rows'] = {}
        for (const raw of rawRows) {
          const parsed = ObjectRowSchema.safeParse(raw)
          if (parsed.success) rows[String(parsed.data.h3Id)] = parsed.data
        }
        const rules = Array.isArray(rawRules) ? rawRules.flatMap((raw) => { const p = SpriteRuleSchema.safeParse(raw); return p.success ? [p.data] : [] }) : null
        const settings = H3SettingsSchema.partial().safeParse(rawSettings)
        const settingsData = settings.success ? settings.data : {}
        const roleSids = parseRoleSids(extra.sceneryRoleSids)
        const decoration = Array.isArray(extra.decorationRules) ? extra.decorationRules.flatMap((raw) => { const p = DecorationRuleSchema.safeParse(raw); return p.success ? [p.data] : [] }) : []
        set({ edits: { rows, spriteRules: rules && rules.length > 0 ? rules : null, settings: settingsData as Partial<H3Settings>, sceneryRoleSids: roleSids, decorationRules: decoration.length > 0 ? decoration : null } })
        return Object.keys(rows).length + (rules && rules.length > 0 ? 1 : 0) + Object.keys(settingsData).length + Object.keys(roleSids).length + (decoration.length > 0 ? 1 : 0)
      },
    }),
    {
      name: 'tse-h3-mapping-overrides',
      version: 3,
      partialize: (s) => ({ edits: s.edits }),
      // Version 1 kept only object rows, as `overrides`.
      migrate: (persisted, version) => {
        if (version < 2) return { edits: { ...NO_MAPPING_EDITS, rows: (persisted as { overrides?: MappingEdits['rows'] }).overrides ?? {} } }
        // Version 2 had no role table or borrowing rules.
        return { edits: { ...NO_MAPPING_EDITS, ...(persisted as { edits: MappingEdits }).edits } }
      },
    },
  ),
)

// Keep the resolvers' table in step with the store: now (persist has already read localStorage) and on every edit.
applyMappingEdits(useH3MappingStore.getState().edits)
useH3MappingStore.subscribe((state) => applyMappingEdits(state.edits))
