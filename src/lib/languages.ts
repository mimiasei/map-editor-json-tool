// ─── Game languages ───────────────────────────────────────────────────────────
// The IDs are the directory names the game uses under Lang/ inside Core.zip —
// they are not BCP 47 tags, and the spelling of "BRportugese" is the game's, not
// a typo. A map ZIP places its tokens at Lang/<id>/texts/<map name>.json (not
// customMaps.json — see zip-export.ts's mapNameSnakeCase, which avoids
// colliding with the game's own Core.zip file of that exact name).
//
// English is the base language: it is always present, is what the editor's
// previews and validation read, and is the fallback for untranslated SIDs.

export interface GameLanguage {
  /** Directory name under Lang/ — also the key used in the project file. */
  id: string
  label: string
}

import { BASE_LANGUAGE } from './base-language'
import i18n from '@/lib/i18n'
export { BASE_LANGUAGE }

/** All 16 languages shipped in Core.zip, English first, then alphabetical. */
export const GAME_LANGUAGES: GameLanguage[] = [
  { id: 'english', label: 'English' },
  { id: 'BRportugese', label: 'Portuguese (Brazil)' },
  { id: 'czech', label: 'Czech' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'hungarian', label: 'Hungarian' },
  { id: 'italian', label: 'Italian' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'korean', label: 'Korean' },
  { id: 'polish', label: 'Polish' },
  { id: 'russian', label: 'Russian' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'turkish', label: 'Turkish' },
  { id: 'ukrainian', label: 'Ukrainian' },
  { id: 'zhCN', label: 'Chinese (Simplified)' },
  { id: 'zhTW', label: 'Chinese (Traditional)' },
]

/**
 * Languages the interface can be shown in. Norwegian is here but not in GAME_LANGUAGES: the game ships no Norwegian
 * (no Lang/norwegian in Core.zip), so a map can never carry Norwegian text and game names stay English.
 */
export const UI_LANGUAGES: GameLanguage[] = GAME_LANGUAGES.flatMap((l) => (l.id === 'polish' ? [{ id: 'norwegian', label: 'Norwegian' }, l] : [l]))

/** Languages the user can add beside English. */
export const TRANSLATABLE_LANGUAGES = GAME_LANGUAGES.filter((l) => l.id !== BASE_LANGUAGE)

/** BCP 47 codes for Intl.DisplayNames; the game's ids are directory names, not language tags. */
const BCP47: Record<string, string> = {
  english: 'en', BRportugese: 'pt-BR', czech: 'cs', french: 'fr', german: 'de', hungarian: 'hu', italian: 'it', japanese: 'ja',
  korean: 'ko', polish: 'pl', russian: 'ru', spanish: 'es', turkish: 'tr', ukrainian: 'uk', zhCN: 'zh-Hans', zhTW: 'zh-Hant',
}

/** The language's name in the UI language ("Allemand" in French). Falls back to the English label. */
export function languageLabel(id: string): string {
  const english = GAME_LANGUAGES.find((l) => l.id === id)?.label ?? id
  const code = BCP47[id]
  if (!code || i18n.language === 'en') return english
  try {
    const name = new Intl.DisplayNames([i18n.language], { type: 'language' }).of(code)
    return name ? name.charAt(0).toLocaleUpperCase(i18n.language) + name.slice(1) : english
  } catch {
    return english
  }
}

/** Per-language token maps, keyed by language id. Excludes English. */
export type TranslationMap = Record<string, Record<string, string>>

/**
 * Resolve the text to ship for one SID in one language, falling back to English.
 * Shipping the English string beats shipping an empty one — the player sees
 * readable text instead of a blank line.
 */
export function resolveToken(
  sid: string,
  lang: string,
  english: Record<string, string>,
  translations: TranslationMap,
): string {
  if (lang === BASE_LANGUAGE) return english[sid] ?? ''
  const translated = translations[lang]?.[sid]
  if (translated && translated.trim()) return translated
  return english[sid] ?? ''
}

/** Languages that carry at least one non-empty token — the ones worth exporting. */
export function languagesWithContent(translations: TranslationMap): string[] {
  return Object.keys(translations)
    .filter((lang) => Object.values(translations[lang] ?? {}).some((t) => t.trim()))
    .sort()
}

/**
 * Every language a map ZIP will contain: English always, plus each translated one.
 *
 * The ZIP builder and the UI that reports what was written both go through here, so a
 * "wrote english, french" message can never disagree with the archive.
 */
export function shippedLanguages(translations: TranslationMap): string[] {
  return [BASE_LANGUAGE, ...languagesWithContent(translations)]
}

/** Each language's name in itself, for the interface-language picker (a reader who cannot read the current UI language can still find theirs). */
const NATIVE_LABELS: Record<string, string> = {
  english: 'English',
  BRportugese: 'Português (Brasil)',
  czech: 'Čeština',
  french: 'Français',
  german: 'Deutsch',
  hungarian: 'Magyar',
  italian: 'Italiano',
  japanese: '日本語',
  korean: '한국어',
  norwegian: 'Norsk',
  polish: 'Polski',
  russian: 'Русский',
  spanish: 'Español',
  turkish: 'Türkçe',
  ukrainian: 'Українська',
  zhCN: '简体中文',
  zhTW: '繁體中文',
}

export function nativeLanguageLabel(id: string): string {
  return NATIVE_LABELS[id] ?? languageLabel(id)
}
