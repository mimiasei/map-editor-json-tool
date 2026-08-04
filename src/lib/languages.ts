// ─── Game languages ───────────────────────────────────────────────────────────
// The IDs are the directory names the game uses under Lang/ inside Core.zip —
// they are not BCP 47 tags, and the spelling of "BRportugese" is the game's, not
// a typo. A map ZIP places its tokens at Lang/<id>/texts/customMaps.json.
//
// English is the base language: it is always present, is what the editor's
// previews and validation read, and is the fallback for untranslated SIDs.

export interface GameLanguage {
  /** Directory name under Lang/ — also the key used in the project file. */
  id: string
  label: string
}

export const BASE_LANGUAGE = 'english'

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

/** Languages the user can add beside English. */
export const TRANSLATABLE_LANGUAGES = GAME_LANGUAGES.filter((l) => l.id !== BASE_LANGUAGE)

export function languageLabel(id: string): string {
  return GAME_LANGUAGES.find((l) => l.id === id)?.label ?? id
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
