import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '@/locales/en.json'
import fr from '@/locales/fr.json'
import de from '@/locales/de.json'
import uk from '@/locales/uk.json'
import ru from '@/locales/ru.json'
import nb from '@/locales/nb.json'
import pl from '@/locales/pl.json'
import { BASE_LANGUAGE } from '@/lib/base-language'
import { useLocaleStore } from '@/store/useLocaleStore'

// The setting holds the game's Lang/<id> directory name (see languages.ts), so the same value also
// picks the Core.zip texts for game names. i18next needs a real BCP 47 code, though: it derives the
// plural rules from it ("fr" counts 0 as singular, an unknown id like "french" would fall back to
// English rules). UI_LANG_CODES maps one to the other; a locale without a bundle, or a key missing
// from one, falls back to English.
const UI_LANG_CODES: Record<string, string> = {
  [BASE_LANGUAGE]: 'en',
  french: 'fr',
  german: 'de',
  ukrainian: 'uk',
  russian: 'ru',
  polish: 'pl',
  // Not a game language (no Lang/norwegian in Core.zip): game names stay English, see buildLocalNames.
  norwegian: 'nb',
}

const BASE_CODE = UI_LANG_CODES[BASE_LANGUAGE]

export const UI_RESOURCES = {
  en: { translation: en },
  fr: { translation: fr },
  de: { translation: de },
  uk: { translation: uk },
  ru: { translation: ru },
  nb: { translation: nb },
  pl: { translation: pl },
}

export type UiResource = typeof en

export function isUiLocaleAvailable(id: string): boolean {
  return id in UI_LANG_CODES
}

const codeFor = (id: string): string => UI_LANG_CODES[id] ?? BASE_CODE

void i18n.use(initReactI18next).init({
  resources: UI_RESOURCES,
  lng: codeFor(useLocaleStore.getState().uiLocale),
  fallbackLng: BASE_CODE,
  // Key separator '.' with nested json; React already escapes output.
  interpolation: { escapeValue: false },
  // Resources are bundled, so init resolves synchronously and t() works on first render.
  initImmediate: false,
})

useLocaleStore.subscribe((s) => {
  const next = codeFor(s.uiLocale)
  if (i18n.language !== next) void i18n.changeLanguage(next)
})

export default i18n
