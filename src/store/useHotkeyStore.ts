import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { HOTKEY_DEFS, hotkeyDef } from '@/lib/hotkeys'

// Only the user's changes are stored (id -> combo, '' = switched off), so shortcuts added in later releases get their default.
interface HotkeyState {
  overrides: Record<string, string>
  setCombo: (id: string, combo: string) => void
  reset: (id: string) => void
  resetAll: () => void
}

export const useHotkeyStore = create<HotkeyState>()(
  persist(
    (set) => ({
      overrides: {},
      setCombo: (id, combo) => set((s) => ({ overrides: { ...s.overrides, [id]: combo } })),
      reset: (id) => set((s) => {
        const rest = { ...s.overrides }
        delete rest[id]
        return { overrides: rest }
      }),
      resetAll: () => set({ overrides: {} }),
    }),
    { name: 'oe-hotkeys', version: 1 },
  ),
)

/** The combo in effect for a shortcut ('' when the user switched it off). */
export function effectiveCombo(overrides: Record<string, string>, id: string): string {
  return overrides[id] ?? hotkeyDef(id)?.defaultCombo ?? ''
}

export function useHotkeyCombo(id: string): string {
  return useHotkeyStore((s) => effectiveCombo(s.overrides, id))
}

/** Another shortcut of the same scope that already uses `combo`, if any. */
export function findHotkeyConflict(overrides: Record<string, string>, id: string, combo: string): string | undefined {
  const def = hotkeyDef(id)
  if (!def || !combo) return undefined
  return HOTKEY_DEFS.find((d) => d.id !== id && d.scope === def.scope && effectiveCombo(overrides, d.id) === combo)?.id
}
