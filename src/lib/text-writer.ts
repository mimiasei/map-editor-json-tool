// ─── Text writer (frontend side) ───────────────────────────────────────────────
// Thin, desktop-only wrapper around the Rust commands in src-tauri/src/
// text_writer/. The prompts live in Rust; this file only sends structured
// requests and receives plain strings. Every failure is reported as a
// TextWriterError so callers can fall back to the built-in text without fuss.
// The web build has no text writer (isTauri() is false there).

import { isTauri } from '@/lib/native-fs'
import type { TextSpec } from '@/types/story'
import i18n from '@/lib/i18n'

export type Provider = 'gemini' | 'groq'

export const PROVIDERS: { id: Provider; label: string; keyHelp: string; keyUrl: string }[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    keyHelp: 'Create a free key in Google AI Studio.',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'groq',
    label: 'Groq',
    keyHelp: 'Create a free key in the Groq console.',
    keyUrl: 'https://console.groq.com/keys',
  },
]

export type WriterErrorCode =
  | 'no_key'
  | 'auth'
  | 'rate_limited'
  | 'network'
  | 'bad_response'
  | 'invalid'
  | 'store'
  | 'unavailable'

export interface TextWriterError {
  code: WriterErrorCode
  message: string
}

function toError(e: unknown): TextWriterError {
  if (e && typeof e === 'object' && 'code' in e && typeof (e as TextWriterError).code === 'string') {
    const err = e as TextWriterError
    return { code: err.code, message: String(err.message ?? '') }
  }
  return { code: 'unavailable', message: typeof e === 'string' ? e : 'The text writer is not available.' }
}

const PROVIDER_KEY = 'oe-text-writer-provider'
const CONSENT_KEY = 'oe-text-writer-consent'

export function getProvider(): Provider {
  try {
    const v = localStorage.getItem(PROVIDER_KEY)
    if (v === 'gemini' || v === 'groq') return v
  } catch {
    // storage unavailable: use the default
  }
  return 'gemini'
}

export function setProvider(p: Provider): void {
  try {
    localStorage.setItem(PROVIDER_KEY, p)
  } catch {
    // storage unavailable: the choice just is not remembered
  }
}

/** Whether the user has accepted that story text is sent to the online service. */
export function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

export function setConsent(on: boolean): void {
  try {
    if (on) localStorage.setItem(CONSENT_KEY, '1')
    else localStorage.removeItem(CONSENT_KEY)
  } catch {
    // storage unavailable: asked again next time
  }
}

/** The text writer exists only in the desktop app. */
export function textWriterSupported(): boolean {
  return isTauri()
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw toError(null)
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<T>(command, args)
  } catch (e) {
    throw toError(e)
  }
}

export async function hasKey(provider: Provider = getProvider()): Promise<boolean> {
  if (!isTauri()) return false
  try {
    return await call<boolean>('text_writer_has_key', { provider })
  } catch {
    return false
  }
}

/** True when text can be generated right now: desktop app, consent given, key stored. */
export async function textWriterReady(): Promise<boolean> {
  return textWriterSupported() && hasConsent() && (await hasKey())
}

export const setKey = (provider: Provider, key: string) => call<void>('text_writer_set_key', { provider, key })
export const clearKey = (provider: Provider) => call<void>('text_writer_clear_key', { provider })
/** Sends one tiny request. Resolves with the name of the model that answered. */
export const testKey = (provider: Provider) => call<string>('text_writer_test', { provider })

/** Looks up which model will be used (a model-list call, no generation quota). */
export const checkModel = (provider: Provider = getProvider()) => call<string>('text_writer_check', { provider })

/** Progress lines from Rust while a request runs ("Asking gemini-3.5-flash-lite…"). Returns the unsubscribe. */
export async function onWriterStatus(cb: (line: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  try {
    const { listen } = await import('@tauri-apps/api/event')
    return await listen<string>('text-writer-status', (e) => cb(e.payload))
  } catch {
    return () => {}
  }
}

/** At startup: if a key is saved, confirm the model still exists (silent on failure). */
export async function checkModelAtStartup(): Promise<void> {
  if (!textWriterSupported() || !hasConsent()) return
  try {
    if (await hasKey()) await checkModel()
  } catch {
    // The details are in the app log; the settings dialog shows errors when the user tests.
  }
}

// ─── Requests ──────────────────────────────────────────────────────────────────

export interface TextRequest {
  id: string
  kind: TextSpec['kind']
  mode: 'write' | 'translate' | 'polish'
  tone: string
  length: string
  speaker?: string
  intent?: string
  context: Record<string, string>
  /** Output language (game language id). */
  lang: string
  sourceLang?: string
  sourceText?: string
}

export function writeRequest(spec: TextSpec, lang: string): TextRequest {
  return {
    id: spec.id,
    kind: spec.kind,
    mode: 'write',
    tone: spec.tone,
    length: spec.length,
    speaker: spec.speaker,
    intent: spec.intent,
    context: spec.context,
    lang,
  }
}

export function translateRequest(
  spec: TextSpec,
  fromLang: string,
  toLang: string,
  sourceText: string,
): TextRequest {
  return {
    ...writeRequest(spec, toLang),
    mode: 'translate',
    sourceLang: fromLang,
    sourceText,
  }
}

/** Texts keyed by request id. Rejects with a TextWriterError. */
export async function generateTexts(requests: TextRequest[]): Promise<Record<string, string>> {
  if (requests.length === 0) return {}
  const out = await call<{ id: string; text: string }[]>('text_writer_generate', {
    provider: getProvider(),
    requests,
  })
  return Object.fromEntries(out.map((t) => [t.id, t.text]))
}

// ─── Story import ──────────────────────────────────────────────────────────────

export interface StoryDraft {
  title: string
  tone: string
  slots: { id: string; label: string; cardinality: 'one' | 'many'; min: number; entityKind: 'town' | 'object' | 'squad' }[]
  variables: { key: string; label: string; kind: string; min?: number; max?: number }[]
  beats: Array<Record<string, unknown> & { kind: string; note?: string }>
}

export const MAX_IDEA_CHARS = 3000

export function importStoryDraft(text: string, lang: string): Promise<StoryDraft> {
  return call<StoryDraft>('story_import', { provider: getProvider(), text, lang })
}

/** A short line for the user, or null when staying quiet is better. */
export function describeError(e: TextWriterError): string | null {
  switch (e.code) {
    case 'auth':
      return i18n.t('story.writerErrors.auth')
    case 'rate_limited':
      return i18n.t('story.writerErrors.builtInUsed', { message: e.message || i18n.t('story.writerErrors.rateLimitedDefault') })
    case 'invalid':
      return e.message || null
    case 'unavailable':
    case 'no_key':
      return null
    case 'network':
      return i18n.t('story.writerErrors.builtInUsed', { message: e.message || i18n.t('story.writerErrors.networkDefault') })
    case 'bad_response':
      return i18n.t('story.writerErrors.badResponse', { details: e.message || i18n.t('story.writerErrors.noDetails') })
    case 'store':
      return i18n.t('story.writerErrors.store', { details: e.message || i18n.t('story.writerErrors.noDetails') })
    default:
      return i18n.t('story.writerErrors.fallback')
  }
}
