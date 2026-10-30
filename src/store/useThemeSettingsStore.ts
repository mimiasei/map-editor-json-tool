import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PRESET_THEMES } from '@/lib/theme-presets'

// ─── Default factory values ────────────────────────────────────────────────

export const DEFAULT_LIGHT_COLORS: ThemeColors = {
  appBackground: '#7c919d',
  background: '#f3f5f9',
  columnLeft: '#d8eff5',
  columnCenter: '#bad8e5',
  columnRight: '#a1c3dc',
  popover: '#ffffff',
  primary: '#2d7a5a',
  secondary: '#dde1ea',
}

export const DEFAULT_FONT_SIZE = 14

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ThemeColors {
  appBackground: string
  background: string
  columnLeft: string
  columnCenter: string
  columnRight: string
  popover: string
  primary: string
  secondary: string
}

export interface ThemeSettings {
  id: string
  name: string
  /** Set on built-in presets for grouping in the theme picker; absent on custom themes. */
  category?: string
  colors: ThemeColors
  fontSize: number
  use3dButtons: boolean
}

interface ThemeSettingsState {
  themes: ThemeSettings[]
  activeThemeId: string

  setActiveTheme(id: string): void
  updateTheme(id: string, patch: Partial<ThemeColors> & { fontSize?: number; name?: string; use3dButtons?: boolean }): void
  createTheme(name: string): ThemeSettings
  deleteTheme(id: string): void
  revertDefault(): void
}

// ─── Helper ────────────────────────────────────────────────────────────────

function makeDefaultTheme(): ThemeSettings {
  return {
    id: 'default-light',
    name: 'Default Light',
    colors: { ...DEFAULT_LIGHT_COLORS },
    fontSize: DEFAULT_FONT_SIZE,
    use3dButtons: true,
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useThemeSettingsStore = create<ThemeSettingsState>()(
  persist(
    (set, get) => ({
      themes: [makeDefaultTheme(), ...PRESET_THEMES],
      activeThemeId: 'default-light',

      setActiveTheme(id) {
        if (get().themes.find((t) => t.id === id)) {
          set({ activeThemeId: id })
        }
      },

      updateTheme(id, patch) {
        set((s) => ({
          themes: s.themes.map((t) => {
            if (t.id !== id) return t
            const { fontSize, name, use3dButtons, ...colorPatch } = patch
            return {
              ...t,
              ...(name !== undefined ? { name } : {}),
              ...(fontSize !== undefined ? { fontSize } : {}),
              ...(use3dButtons !== undefined ? { use3dButtons } : {}),
              colors: { ...t.colors, ...colorPatch },
            }
          }),
        }))
      },

      createTheme(name) {
        const source = get().themes.find((t) => t.id === get().activeThemeId) ?? get().themes[0]
        const newTheme: ThemeSettings = {
          id: `custom-${Date.now()}`,
          name,
          colors: { ...source.colors },
          fontSize: source.fontSize,
          use3dButtons: source.use3dButtons,
        }
        set((s) => ({ themes: [...s.themes, newTheme], activeThemeId: newTheme.id }))
        return newTheme
      },

      deleteTheme(id) {
        if (id === 'default-light') return
        set((s) => {
          const themes = s.themes.filter((t) => t.id !== id)
          const activeThemeId = s.activeThemeId === id ? 'default-light' : s.activeThemeId
          return { themes, activeThemeId }
        })
      },

      revertDefault() {
        set((s) => ({
          themes: s.themes.map((t) =>
            t.id === 'default-light' ? makeDefaultTheme() : t,
          ),
        }))
      },
    }),
    {
      name: 'oe-theme-settings',
      version: 4,
      // Syncs the saved theme list with PRESET_THEMES whenever the stored version is
      // stale: built-in presets (id "preset-…") that no longer exist are dropped,
      // missing ones are added, and the active theme falls back to the default if it
      // was dropped. Default and custom themes are kept. Runs once per browser
      // profile per version, so deleting a preset afterwards is permanent. Bump
      // `version` and the `version <` check below whenever PRESET_THEMES changes.
      migrate: (persisted, version) => {
        const state = persisted as ThemeSettingsState
        if (version < 4) {
          const current = new Set(PRESET_THEMES.map((t) => t.id))
          // drop old presets that no longer exist, keep default + custom themes
          state.themes = state.themes.filter((t) => !t.id.startsWith('preset-') || current.has(t.id))
          // then append the missing ones as before
          if (!state.themes.some((t) => t.id === state.activeThemeId)) state.activeThemeId = 'default-light'
          const existingIds = new Set(state.themes.map((t) => t.id))
          const missingPresets = PRESET_THEMES.filter((t) => !existingIds.has(t.id))
          state.themes = [...state.themes, ...missingPresets]
        }
        return state
      },
    },
  ),
)
