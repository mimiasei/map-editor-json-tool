import { useLayoutEffect } from 'react'
import { useThemeSettingsStore } from '@/store/useThemeSettingsStore'
import { useTheme } from '@/hooks/useTheme'

/**
 * Applies the active light-theme customizations as CSS custom properties on
 * <html>. When dark mode is active the overrides are removed so the locked
 * dark theme takes over unchanged.
 *
 * Call this once near the root of the app (AppShell).
 */
export function useApplyThemeSettings() {
  const { theme } = useTheme()
  const { themes, activeThemeId } = useThemeSettingsStore()

  useLayoutEffect(() => {
    const root = document.documentElement

    if (theme === 'dark') {
      // Remove all custom overrides — dark theme is locked.
      root.style.removeProperty('--column-left')
      root.style.removeProperty('--column-center')
      root.style.removeProperty('--column-right')
      root.style.removeProperty('--background-custom')
      root.style.removeProperty('--popover-custom')
      root.style.removeProperty('--primary-custom')
      root.style.removeProperty('--secondary-custom')
      root.style.removeProperty('font-size')
      return
    }

    const active = themes.find((t) => t.id === activeThemeId) ?? themes[0]
    if (!active) return

    const { colors, fontSize } = active

    // Column backgrounds are set as plain CSS variables (not HSL-format shadcn
    // vars), consumed directly in AppShell via var(--column-*).
    root.style.setProperty('--column-left',   colors.columnLeft)
    root.style.setProperty('--column-center', colors.columnCenter)
    root.style.setProperty('--column-right',  colors.columnRight)

    // For shadcn CSS vars the expected format is "H S% L%" (no hsl() wrapper).
    // We store hex in the store and convert here so the rest of the UI picks
    // up changes through the existing Tailwind color tokens.
    root.style.setProperty('--background', hexToHsl(colors.background))
    root.style.setProperty('--popover',    hexToHsl(colors.popover))
    root.style.setProperty('--primary',    hexToHsl(colors.primary))
    root.style.setProperty('--secondary',  hexToHsl(colors.secondary))

    // Font size on the root element; all rem-based Tailwind sizes scale with it.
    root.style.setProperty('font-size', `${fontSize}px`)
  }, [theme, themes, activeThemeId])
}

// ─── Hex → HSL string (shadcn format: "H S% L%") ─────────────────────────

export function hexToHsl(hex: string): string {
  // Strip leading #
  const clean = hex.replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean

  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    const pct = Math.round(l * 100)
    return `0 0% ${pct}%`
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h: number
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    default: h = ((r - g) / d + 4) / 6
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
