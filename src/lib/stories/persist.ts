// The Story Builder's last used choices, kept in localStorage so it reopens
// where it was left. Slot picks are map-specific and are never saved.

import { TONES, type Tone } from '@/lib/script-templates/text-gen/phrases'
import { GAME_LANGUAGES } from '@/lib/languages'
import { TEXT_LENGTHS, type TextLength } from '@/types/story'

const STORAGE_KEY = 'oe-story-builder-settings'

export interface StoryBuilderSettings {
  tone?: Tone
  length?: TextLength
  /** Writing language (game language id). */
  language?: string
}

export function loadStoryBuilderSettings(): StoryBuilderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, unknown>
    const out: StoryBuilderSettings = {}
    if (typeof data.tone === 'string' && (TONES as readonly string[]).includes(data.tone)) out.tone = data.tone as Tone
    if (typeof data.length === 'string' && (TEXT_LENGTHS as readonly string[]).includes(data.length))
      out.length = data.length as TextLength
    if (typeof data.language === 'string' && GAME_LANGUAGES.some((l) => l.id === data.language))
      out.language = data.language
    return out
  } catch {
    return {}
  }
}

export function saveStoryBuilderSettings(settings: StoryBuilderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable: the wizard just starts from defaults next time.
  }
}
