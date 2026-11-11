import { useEffect, useLayoutEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'oe-theme'
const DEFAULT_THEME: Theme = 'light'

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

/** Whether the Game skin is applied (useApplyThemeSettings puts `skin-game` on <html>). */
function useSkinActive(): boolean {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('skin-game'))
  useEffect(() => {
    const check = () => setActive(document.documentElement.classList.contains('skin-game'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return active
}

export function useTheme() {
  const [stored, setThemeState] = useState<Theme>(getStoredTheme)
  // The Game skin is dark only (the game's own look): the stored preference is kept and returns when the skin goes off.
  const skinLocked = useSkinActive()
  const theme: Theme = skinLocked ? 'dark' : stored

  // useLayoutEffect applies the class before paint, preventing a flash of the
  // wrong theme.
  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, stored)
    } catch {
      // ignore — localStorage unavailable
    }
  }, [stored])

  const setTheme = (t: Theme) => setThemeState(t)
  const toggleTheme = () => setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'))

  return { theme, setTheme, toggleTheme, skinLocked }
}
