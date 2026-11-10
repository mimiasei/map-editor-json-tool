import { useEffect, useLayoutEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'oe-theme'
const DEFAULT_THEME: Theme = 'light'
const SET_THEME_EVENT = 'oe:set-theme'

/** Switches the light/dark mode from anywhere (each useTheme call keeps its own state, so the toolbar toggle would not notice). */
export function requestTheme(theme: Theme) {
  window.dispatchEvent(new CustomEvent<Theme>(SET_THEME_EVENT, { detail: theme }))
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable
  }
  return DEFAULT_THEME
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  // useLayoutEffect applies the class before paint, preventing a flash of the
  // wrong theme. It also persists the preference to localStorage.
  useLayoutEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore — localStorage unavailable
    }
  }, [theme])

  useEffect(() => {
    const onSet = (e: Event) => setThemeState((e as CustomEvent<Theme>).detail)
    window.addEventListener(SET_THEME_EVENT, onSet)
    return () => window.removeEventListener(SET_THEME_EVENT, onSet)
  }, [])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'))

  return { theme, setTheme, toggleTheme }
}
