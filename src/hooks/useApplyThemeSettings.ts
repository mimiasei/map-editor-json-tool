import { useLayoutEffect, useState } from 'react'
import { useThemeSettingsStore } from '@/store/useThemeSettingsStore'

/**
 * Reads whether dark mode is currently active directly from the DOM class,
 * and watches for changes via MutationObserver. This avoids depending on the
 * local-state `useTheme()` hook (which is a separate instance from Toolbar's)
 * and ensures the effect re-runs whenever the theme toggle fires.
 */
function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  )

  useLayoutEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

// ─── CSS properties we write in light mode ────────────────────────────────

const CUSTOM_PROPS = [
  '--app-background',
  '--column-left',
  '--column-center',
  '--column-right',
  '--background',
  '--popover',
  '--primary',
  '--secondary',
] as const

/**
 * Applies the active light-theme customizations as CSS custom properties on
 * <html>. When dark mode is active all overrides are removed so the locked
 * dark theme takes over unchanged.
 *
 * Call this once near the root of the app (AppShell).
 */
export function useApplyThemeSettings() {
  const isDark = useDarkMode()
  const { themes, activeThemeId } = useThemeSettingsStore()

  useLayoutEffect(() => {
    const root = document.documentElement

    if (isDark) {
      // Remove every property this hook can set so inline styles don't bleed
      // through on top of the locked dark theme's class-based variables.
      for (const prop of CUSTOM_PROPS) root.style.removeProperty(prop)
      root.style.removeProperty('font-size')
      root.classList.remove('buttons-3d')
      return
    }

    const active = themes.find((t) => t.id === activeThemeId) ?? themes[0]
    if (!active) return

    const { colors, fontSize, use3dButtons } = active

    // Column backgrounds — consumed directly via var(--column-*) in AppShell.
    root.style.setProperty('--app-background', colors.appBackground)
    root.style.setProperty('--column-left',   colors.columnLeft)
    root.style.setProperty('--column-center', colors.columnCenter)
    root.style.setProperty('--column-right',  colors.columnRight)

    // shadcn CSS vars expect "H S% L%" format (no hsl() wrapper).
    root.style.setProperty('--background', hexToHsl(colors.background))
    root.style.setProperty('--popover',    hexToHsl(colors.popover))
    root.style.setProperty('--primary',    hexToHsl(colors.primary))
    root.style.setProperty('--secondary',  hexToHsl(colors.secondary))

    // Font size on the root element; all rem-based Tailwind sizes scale with it.
    root.style.setProperty('font-size', `${fontSize}px`)

    // 3D button style — toggled via a class on <html>.
    root.classList.toggle('buttons-3d', use3dButtons)
  }, [isDark, themes, activeThemeId])
}

// ─── Hex → HSL string (shadcn format: "H S% L%") ─────────────────────────

export function hexToHsl(hex: string): string {
  const clean = hex.replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean

  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255

  if (isNaN(r) || isNaN(g) || isNaN(b)) return '0 0% 100%'

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return `0 0% ${Math.round(l * 100)}%`
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
