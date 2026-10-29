import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import { BASE_LANGUAGE } from '@/lib/languages'
import { useLocaleStore } from '@/store/useLocaleStore'

// Locale ids are the game's Lang/<id> directory names (see languages.ts), so the
// same setting can later pick the Core.zip texts for game names. Only English
// has UI text so far; a locale without a bundle falls back to English per key.
export const UI_RESOURCES = {
  [BASE_LANGUAGE]: { translation: en },
}

export type UiResource = typeof en

export function isUiLocaleAvailable(id: string): boolean {
  return id in UI_RESOURCES
}

void i18n.use(initReactI18next).init({
  resources: UI_RESOURCES,
  lng: isUiLocaleAvailable(useLocaleStore.getState().uiLocale)
    ? useLocaleStore.getState().uiLocale
    : BASE_LANGUAGE,
  fallbackLng: BASE_LANGUAGE,
  // Key separator '.' with nested json; React already escapes output.
  interpolation: { escapeValue: false },
  // Resources are bundled, so init resolves synchronously and t() works on first render.
  initImmediate: false,
})

useLocaleStore.subscribe((s) => {
  const next = isUiLocaleAvailable(s.uiLocale) ? s.uiLocale : BASE_LANGUAGE
  if (i18n.language !== next) void i18n.changeLanguage(next)
})

export default i18n
