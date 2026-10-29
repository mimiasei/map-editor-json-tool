import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { BASE_LANGUAGE } from '@/lib/languages'

// Named uiLocale (not "language") so it is not confused with the per-map content
// languages edited in LocalizationDialog. Values are the game's Lang/<id> names.
interface LocaleState {
  uiLocale: string
  setUiLocale: (id: string) => void
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      uiLocale: BASE_LANGUAGE,
      setUiLocale: (id) => set({ uiLocale: id }),
    }),
    { name: 'oe-ui-locale', version: 1 },
  ),
)
