import JSZip from 'jszip'
import type { DialogFlow } from '@/types/dialog'
import type { CustomHeroDefinition } from '@/types/hero'
import type { CustomMapObjectDefinition } from '@/types/custom-map-object'
import type { CustomArtifactDefinition } from '@/types/custom-artifact'
import { serializeDialogFile } from '@/lib/dialog-file'
import {
  BASE_LANGUAGE,
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

/**
 * snake_case of a map name, used for the shipped localization file name.
 * Anything that isn't a letter/digit becomes an underscore (collapsed and
 * trimmed), so e.g. "Tom's Map!" becomes "tom_s_map". Falls back to
 * "custom_map" for a name with no alphanumeric characters at all.
 */
export function mapNameSnakeCase(mapName: string): string {
  const snake = mapName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return snake || 'custom_map'
}

/**
 * A `{mapName}_{prefix}_{n}` id for a newly-cloned custom identity that won't
 * collide with anything already in `existingIds`. Namespaced off the map name
 * because the shipped destination folders for these clones (e.g.
 * Core/DB/heroes/custom_maps/) are single flat folders shared by every custom
 * map installed in the game — unlike dialogs, which are foldered per map
 * name, two different maps' clones would otherwise overwrite each other on
 * install if they ever picked the same sid.
 */
export function mintCustomSid(mapName: string, prefix: string, existingIds: string[]): string {
  const base = mapNameSnakeCase(mapName)
  const taken = new Set(existingIds)
  let n = 1
  while (taken.has(`${base}_${prefix}_${n}`)) n++
  return `${base}_${prefix}_${n}`
}

/** A heroSid for a newly-cloned custom hero identity (issue #139) — see
 *  mintCustomSid. */
export function mintCustomHeroSid(mapName: string, existingHeroSids: string[]): string {
  return mintCustomSid(mapName, 'hero', existingHeroSids)
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
  customHeroes: Record<string, CustomHeroDefinition> = {},
  customMapObjects: Record<string, CustomMapObjectDefinition> = {},
  customArtifacts: Record<string, CustomArtifactDefinition> = {},
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
  // A custom hero's name/description/motto (issue #139) are the same kind of
  // "SID this dialog created on the fly" as a dialog's title.sid above — miss
  // them here and the hero's identity only ships by accident.
  for (const hero of Object.values(customHeroes)) {
    const { name, description, motto } = hero.definition
    if (typeof name === 'string' && name) sids.add(name)
    if (typeof description === 'string' && description) sids.add(description)
    if (typeof motto === 'string' && motto) sids.add(motto)
  }
  // A custom map object's name/description/narrativeDescription (issue #146)
  // — same reasoning as the custom hero case above.
  for (const obj of Object.values(customMapObjects)) {
    const { name, description, narrativeDescription } = obj.template
    if (typeof name === 'string' && name) sids.add(name)
    if (typeof description === 'string' && description) sids.add(description)
    if (typeof narrativeDescription === 'string' && narrativeDescription) sids.add(narrativeDescription)
  }
  // A custom artifact's name/description/narrativeDescription (issue #150) —
  // same reasoning as the custom hero/object cases above.
  for (const artifact of Object.values(customArtifacts)) {
    const { name, description, narrativeDescription } = artifact.template
    if (typeof name === 'string' && name) sids.add(name)
    if (typeof description === 'string' && description) sids.add(description)
    if (typeof narrativeDescription === 'string' && narrativeDescription) sids.add(narrativeDescription)
  }
  return Array.from(sids)
}

// ─── ZIP builder ──────────────────────────────────────────────────────────────

/**
 * Build the distributable map ZIP as a Blob.
 *
 * ZIP structure:
 *   DB/dialogs/dialogs/custom_maps/{mapName}/{dialogId}.json     (one per dialog)
 *   DB/heroes/custom_maps/{heroSid}.json                         (one per custom hero, issue #139)
 *   Lang/english/texts/{mapName-snake_case}.json                 (always)
 *   Lang/{lang}/texts/{mapName-snake_case}_{lang}.json           (per translated language)
 *
 * The localization file is named after the map, not "customMaps.json" — every
 * custom map used to ship a file with that exact name, which collides with
 * (and overwrites) the same path inside the game's own Core.zip once
 * installed. Every non-English language additionally gets its own `_{lang}`
 * suffix (issue #133) — without it, every language directory shipped the
 * exact same file name, so loading one language's file in memory would
 * overwrite another's. English keeps the bare name for backward
 * compatibility with maps already relying on it. STORE compression is
 * deliberate — the engine failed to read deflated entries.
 *
 * DB/heroes/custom_maps/ is NOT foldered per map name the way dialogs are —
 * it's a single flat folder shared by every custom map installed in the
 * game, matching Core/DB/heroes/custom_maps/cm_fun_hero_1.json's real shape
 * (a shipped map already using this exact mechanism). mintCustomHeroSid()
 * namespaces new heroSids off the map name specifically so two different
 * maps' custom heroes can't collide there.
 *
 * DB/map/objects/custom_maps/{mapName}_objects.json (issue #146) — one file
 * per map holding every custom map object's template in a single `array`
 * (real base-game template files already routinely hold hundreds of entries,
 * so this is well within format norms), plus one
 * DB/objects_logic/{logicSourcePath}/{id}.json per custom object that has a
 * logic clone. Unlike the hero/dialog cases, the logic destination is NOT a
 * single shared folder — confirmed by live in-game testing (issue #146) that
 * a clone must land in the *exact* family subfolder its source logic lives
 * in (e.g. event_banks), or the object stops working; a shared/generic
 * subfolder silently breaks it.
 *
 * DB/items/items/custom_maps/{mapName}_artifacts.json (issue #150) — one file
 * per map holding every custom artifact's template in a single `array`,
 * mirroring the custom map object convention above (the real game's own 13
 * DB/items/items/*.json files are likewise flat multi-entry arrays, not
 * one-file-per-item). Optionally paired with one
 * DB/map/objects/custom_maps/{mapName}_artifact_objects.json batching every
 * custom artifact's ground-placement clone (only present for artifacts whose
 * source had a matching Core/DB/map/objects/6_artifacts.json entry — magic
 * scroll items, for example, have none).
 */
export async function buildMapZipBlob(
  mapName: string,
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
  translations: TranslationMap = {},
  customHeroes: Record<string, CustomHeroDefinition> = {},
  customMapObjects: Record<string, CustomMapObjectDefinition> = {},
  customArtifacts: Record<string, CustomArtifactDefinition> = {},
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

  // ── Custom hero files (issue #139) ──────────────────────────────────────────
  for (const [heroSid, hero] of Object.entries(customHeroes)) {
    zip.file(
      `DB/heroes/custom_maps/${heroSid}.json`,
      JSON.stringify({ array: [hero.definition] }, null, '\t'),
    )
  }

  // ── Custom map object files (issue #146) ─────────────────────────────────────
  const customObjectTemplates = Object.values(customMapObjects).map((o) => o.template)
  if (customObjectTemplates.length > 0) {
    zip.file(
      `DB/map/objects/custom_maps/${mapNameSnakeCase(mapName)}_objects.json`,
      JSON.stringify({ array: customObjectTemplates }, null, '\t'),
    )
  }
  for (const obj of Object.values(customMapObjects)) {
    if (!obj.logic || !obj.logicSourcePath) continue
    zip.file(
      `DB/objects_logic/${obj.logicSourcePath}/${obj.id}.json`,
      JSON.stringify({ array: [obj.logic] }, null, '\t'),
    )
  }

  // ── Custom artifact files (issue #150) ───────────────────────────────────────
  const customArtifactTemplates = Object.values(customArtifacts).map((a) => a.template)
  if (customArtifactTemplates.length > 0) {
    zip.file(
      `DB/items/items/custom_maps/${mapNameSnakeCase(mapName)}_artifacts.json`,
      JSON.stringify({ array: customArtifactTemplates }, null, '\t'),
    )
  }
  const customArtifactMapObjects = Object.values(customArtifacts)
    .map((a) => a.mapObjectTemplate)
    .filter((t): t is Record<string, unknown> => t !== undefined)
  if (customArtifactMapObjects.length > 0) {
    zip.file(
      `DB/map/objects/custom_maps/${mapNameSnakeCase(mapName)}_artifact_objects.json`,
      JSON.stringify({ array: customArtifactMapObjects }, null, '\t'),
    )
  }

  // ── Localization files ─────────────────────────────────────────────────────
  const sids = collectShippedSids(dialogs, localization, customHeroes, customMapObjects, customArtifacts)
  // English always ships; extra languages only when they carry real content.
  const langs = shippedLanguages(translations)
  const mapNameBase = mapNameSnakeCase(mapName)

  for (const lang of langs) {
    const tokens = sids.map((sid) => ({
      sid,
      // Untranslated SIDs fall back to English rather than shipping blanks.
      text: resolveToken(sid, lang, localization, translations),
    }))
    // Every language directory used to get the exact same file name, so
    // loading a second language into the game overwrote the first one in
    // memory (issue #133) — suffix every non-English file with its language.
    const locFileName = lang === BASE_LANGUAGE ? `${mapNameBase}.json` : `${mapNameBase}_${lang}.json`
    zip.file(
      `Lang/${lang}/texts/${locFileName}`,
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
  customHeroes: Record<string, CustomHeroDefinition> = {},
  customMapObjects: Record<string, CustomMapObjectDefinition> = {},
  customArtifacts: Record<string, CustomArtifactDefinition> = {},
): Promise<string[] | null> {
  const blob = await buildMapZipBlob(mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts)
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
