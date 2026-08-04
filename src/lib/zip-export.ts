import JSZip from 'jszip'
import type { DialogFlow } from '@/types/dialog'
import { serializeDialogFile } from '@/lib/dialog-file'
import {
  resolveToken,
  shippedLanguages,
  type TranslationMap,
} from '@/lib/languages'

/** UTF-8 BOM required by the game's localization loader */
const BOM = '﻿'

/** localStorage key holding the user's Core.zip path (written by useCatalogStore). */
const CORE_ZIP_PATH_KEY = 'oe-catalog-override-path'

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * The StreamingAssets directory, derived from the saved Core.zip path — a map ZIP
 * belongs next to Core.zip. Returns null when Core.zip has never been located.
 */
export function getStreamingAssetsDir(): string | null {
  try {
    const coreZipPath = localStorage.getItem(CORE_ZIP_PATH_KEY)
    if (!coreZipPath) return null
    const sep = coreZipPath.includes('\\') ? '\\' : '/'
    const idx = coreZipPath.lastIndexOf(sep)
    return idx > 0 ? coreZipPath.substring(0, idx) : null
  } catch {
    // localStorage unavailable
    return null
  }
}

/** Path separator matching the given absolute path's platform. */
export function pathSep(somePath: string): string {
  return somePath.includes('\\') ? '\\' : '/'
}

/** File name the map ZIP ships under. */
export function mapZipFileName(mapName: string): string {
  return `${mapName.replace(/\s+/g, '_').toLowerCase()}.zip`
}

// ─── Token collection ─────────────────────────────────────────────────────────

/**
 * Every SID that must appear in the shipped localization files: those already in
 * the English map, plus every SID referenced by a dialog slide or answer.
 *
 * `title.sid` counts too — it is the speaker label above the dialog text, and
 * overriding it is the one way to give a portrait a different name from the hero
 * it depicts. It used to be missed here, so a custom speaker name only shipped by
 * accident, when the token happened to already sit in the localization map.
 */
export function collectShippedSids(
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
): string[] {
  const sids = new Set<string>(Object.keys(localization))
  for (const flow of Object.values(dialogs)) {
    for (const slide of flow.slides) {
      if (slide.text) sids.add(slide.text)
      if (slide.title?.sid) sids.add(slide.title.sid)
      if (slide.answers) {
        for (const answer of slide.answers) {
          if (answer.text) sids.add(answer.text)
        }
      }
    }
  }
  return Array.from(sids)
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

/**
 * Build the distributable map ZIP as a Blob.
 *
 * ZIP structure:
 *   DB/dialogs/dialogs/custom_maps/{mapName}/{dialogId}.json  (one per dialog)
 *   Lang/english/texts/customMaps.json                        (always)
 *   Lang/{lang}/texts/customMaps.json                         (per translated language)
 *
 * STORE compression is deliberate — the engine failed to read deflated entries.
 */
export async function buildMapZipBlob(
  mapName: string,
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
  translations: TranslationMap = {},
): Promise<Blob> {
  if (!mapName.trim()) {
    throw new Error('Map name is required to export a ZIP.')
  }

  const zip = new JSZip()

  // ── Dialog files ───────────────────────────────────────────────────────────
  const dialogBase = `DB/dialogs/dialogs/custom_maps/${mapName}`
  for (const [id, flow] of Object.entries(dialogs)) {
    zip.file(`${dialogBase}/${id}.json`, serializeDialogFile(flow))
  }

  // ── Localization files ─────────────────────────────────────────────────────
  const sids = collectShippedSids(dialogs, localization)
  // English always ships; extra languages only when they carry real content.
  const langs = shippedLanguages(translations)

  for (const lang of langs) {
    const tokens = sids.map((sid) => ({
      sid,
      // Untranslated SIDs fall back to English rather than shipping blanks.
      text: resolveToken(sid, lang, localization, translations),
    }))
    zip.file(
      `Lang/${lang}/texts/customMaps.json`,
      BOM + JSON.stringify({ tokens }, null, '\t'),
    )
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

// ─── Export with a save dialog / browser download ─────────────────────────────

/**
 * Build the map ZIP and hand it to the user: a native save dialog under Tauri
 * (defaulting next to Core.zip), a browser download otherwise.
 *
 * Returns the languages written, or null if the user cancelled the save dialog, so the
 * caller can report what actually landed. A missing language file used to be invisible.
 */
export async function exportMapZip(
  mapName: string,
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
  translations: TranslationMap = {},
): Promise<string[] | null> {
  const blob = await buildMapZipBlob(mapName, dialogs, localization, translations)
  const filename = mapZipFileName(mapName)

  // Check for Tauri at runtime — dynamic import avoids bundling issues
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')

    const dir = getStreamingAssetsDir()
    const defaultPath = dir ? `${dir}${pathSep(dir)}${filename}` : filename

    const savePath = await save({
      defaultPath,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (!savePath) return null
    const arrayBuffer = await blob.arrayBuffer()
    await writeFile(savePath, new Uint8Array(arrayBuffer))
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return shippedLanguages(translations)
}
