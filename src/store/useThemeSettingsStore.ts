import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── Default factory values ────────────────────────────────────────────────

export const DEFAULT_LIGHT_COLORS: ThemeColors = {
  appBackground: '#ccee95',   // rgb(204 234 149) — outer app wrapper
  background: '#f3f5f9',    // matches --background: 220 20% 97%
  columnLeft: '#e4ffca',
  columnCenter: '#f6f6b7',
  columnRight: '#ffe8ca',
  popover: '#ffffff',       // matches --popover: 0 0% 100%
  primary: '#2d7a5a',       // matches --primary: 160 50% 32%
  secondary: '#dde1ea',     // matches --secondary: 220 14% 90%
}

export const DEFAULT_FONT_SIZE = 13

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
  colors: ThemeColors
  fontSize: number
}

interface ThemeSettingsState {
  themes: ThemeSettings[]
  activeThemeId: string

  setActiveTheme(id: string): void
  updateTheme(id: string, patch: Partial<ThemeColors> & { fontSize?: number; name?: string }): void
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
  }
}

// ─── Store ─────────────────────────────────────────────────────────────────

export const useThemeSettingsStore = create<ThemeSettingsState>()(
  persist(
    (set, get) => ({
      themes: [makeDefaultTheme()],
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
            const { fontSize, name, ...colorPatch } = patch
            return {
              ...t,
              ...(name !== undefined ? { name } : {}),
              ...(fontSize !== undefined ? { fontSize } : {}),
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
    },
  ),
)
