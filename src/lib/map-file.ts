// ─── .map file orchestration ──────────────────────────────────────────────────
// Ties together: open dialog → binary parse → sidecar JSON check → load stores.
// This is the single entry point for "Open .map file".

import { openMapFile, checkFileExists, readTextFileAt } from '@/lib/native-fs'
import { parseMapFile } from '@/lib/map-parser'
import { extractMapContext, extractScenario } from '@/lib/map-extract'
import { importScenario } from '@/lib/import'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useMapDocumentStore } from '@/store/useMapDocumentStore'
import { readMapContainer, gunzipBytes } from '@/lib/map-write'
import { logInfo, logWarn } from '@/lib/logger'
import { DEBUG } from '@/lib/debug'

export interface OpenMapResult {
  /** Display name, e.g. "my_map.map" */
  name: string
  /** Absolute path to the .map file (null in browser) */
  mapPath: string | null
  /** Absolute path to the sidecar .json (null when not discoverable, e.g. browser) */
  sidecarPath: string | null
  /** Whether the sidecar JSON was found and used */
  sidecarLoaded: boolean
  /** Whether Block 4 fallback was used (no sidecar) */
  block4Used: boolean
  /** Non-fatal warnings (sidecar parse issues, etc.) */
  warnings: string[]
}

/**
 * Derive the sidecar JSON path from the native .map path, preserving the
 * original path separator style so Tauri FS APIs receive a valid OS path.
 */
function sidecarPathFor(mapPath: string, mapName: string): string {
  const stem = mapName.replace(/\.map$/i, '')
  // Find the directory prefix from the raw (possibly backslash) path
  // by stripping the filename from the end.
  const nameEscaped = mapName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const dirMatch = mapPath.match(new RegExp(`^(.*[/\\\\])${nameEscaped}$`))
  const dir = dirMatch ? dirMatch[1] : ''
  return dir ? `${dir}${stem}.json` : `${stem}.json`
}

/**
 * Show an open dialog for .map files, parse the binary, load the sidecar JSON
 * (or fall back to Block 4), and populate both the scenario store and the map
 * context store. Returns null if the user cancels.
 */
export async function openAndLoadMapFile(): Promise<OpenMapResult | null> {
  const file = await openMapFile()
  if (!file) return null
  return loadParsedMapFile(file.name, file.path || null, file.buffer)
}

/**
 * Parse an already-in-memory .map file's bytes, load the sidecar JSON (or
 * fall back to Block 4), and populate both the scenario store and the map
 * context store — the shared tail end of `openAndLoadMapFile()`, factored
 * out so a freshly-created map (written to disk, never opened via a picker)
 * can be loaded through the exact same path. For a brand-new map there's no
 * sidecar yet and Block 4 is a blank shell, so this naturally produces an
 * empty scenario with zero special-casing.
 */
export async function loadParsedMapFile(name: string, mapPath: string | null, buffer: ArrayBuffer): Promise<OpenMapResult> {
  const warnings: string[] = []

  // ── Parse binary ────────────────────────────────────────────────────────────
  const raw = await parseMapFile(buffer)
  logInfo(`Parsed .map: ${name}`)

  // ── In-memory document (issue #195 follow-up) ────────────────────────────
  // A second, independent parse of the same bytes via map-write.ts's own
  // reader — deliberately duplicated rather than shared with parseMapFile
  // above, matching this codebase's existing "neither parser is safe to
  // build the other on" convention (see map-write.ts's header comment).
  // Every Map Grid edit applies to this container directly from now on;
  // nothing touches disk until an explicit Save.
  useMapDocumentStore.getState().loadContainer(readMapContainer(await gunzipBytes(new Uint8Array(buffer))))
  if (DEBUG.mapLoading) {
    console.log('[map-file] raw blocks:', {
      block1Keys: Object.keys(raw.block1),
      block2Keys: Object.keys(raw.block2),
      block3Keys: Object.keys(raw.block3),
      block4Keys: Object.keys(raw.block4),
      block4: raw.block4,
    })
  }

  // ── Map context (always from .map binary) ────────────────────────────────────
  const context = extractMapContext(raw)
  if (DEBUG.mapLoading) {
    console.log('[map-file] extractMapContext result:', {
      mapName: context.mapName,
      entityCount: context.entities.length,
      entities: context.entities,
      objectSidsCount: context.objectSids.length,
      spawnsCount: context.spawns.length,
    })
  }
  useMapContextStore.getState().setContext(context)

  // ── Sidecar path — derived from native OS path, not forward-slash-normalized ─
  // Using the raw path preserves backslashes on Windows so Tauri FS calls work.
  const sidecarPath = mapPath ? sidecarPathFor(mapPath, name) : null

  let sidecarLoaded = false
  let block4Used = false
  let scenario = extractScenario(raw)   // default: Block 4
  let mapName = context.mapName
  let importedMapName = ''
  // Editor-only metadata from the sidecar. Without carrying these through, opening
  // a .map would silently drop every dialog and localization token the project has.
  let importedDialogs: Record<string, import('@/types/dialog').DialogFlow> = {}
  let importedLocalization: Record<string, string> = {}
  let importedTranslations: import('@/lib/languages').TranslationMap = {}
  let importedCustomHeroes: Record<string, import('@/types/hero').CustomHeroDefinition> = {}
  let importedCustomMapObjects: Record<string, import('@/types/custom-map-object').CustomMapObjectDefinition> = {}
  // Also never restored from the sidecar before this fix (issue #165 audit) —
  // opening a .map+sidecar silently dropped any custom artifacts/buffs it had,
  // unlike the "Open JSON" and "Load template" paths which already handled them.
  let importedCustomArtifacts: Record<string, import('@/types/custom-artifact').CustomArtifactDefinition> = {}
  let importedCustomBuffs: Record<string, import('@/types/custom-buff').CustomBuffDefinition> = {}

  // ── Try sidecar (Tauri only — needs file system access) ──────────────────────
  if (sidecarPath && (await checkFileExists(sidecarPath))) {
    const text = await readTextFileAt(sidecarPath)
    if (text) {
      const {
        scenario: imported,
        errors,
        warnings: iw,
        mapName: mn,
        dialogs: dl,
        localization: loc,
        translations: tr,
        customHeroes: ch,
        customMapObjects: cmo,
        customArtifacts: ca,
        customBuffs: cb,
      } = importScenario(text)
      if (imported) {
        scenario = imported
        importedMapName = mn
        importedDialogs = dl
        importedLocalization = loc
        importedTranslations = tr
        importedCustomHeroes = ch
        importedCustomMapObjects = cmo
        importedCustomArtifacts = ca
        importedCustomBuffs = cb
        sidecarLoaded = true
        logInfo(`Loaded sidecar: ${sidecarPath}`)
      } else {
        warnings.push(...errors.map((e) => `Sidecar parse error: ${e}`))
        // fall through to Block 4
      }
      if (iw.length > 0) warnings.push(...iw.map((w) => `Sidecar warning: ${w}`))
    }
  }

  if (!sidecarLoaded) {
    block4Used = true
    logWarn(`No sidecar found for ${name}, using Block 4 scripting data`)
  }

  if (DEBUG.mapLoading) {
    console.log('[map-file] scenario loaded:', {
      sidecarLoaded,
      block4Used,
      countersCount: scenario.counters?.length ?? 0,
      interruptionsCount: scenario.interruptions?.length ?? 0,
      questsCount: scenario.quests?.length ?? 0,
    })
  }

  // Use _mapName from sidecar if present, else Block 2 mapName
  if (importedMapName) mapName = importedMapName

  // ── Load scenario store ──────────────────────────────────────────────────────
  // currentFileName = the .map filename so the toolbar shows the correct name.
  // currentFilePath = sidecarPath so Ctrl+S knows where to write.
  const store = useScenarioStore.getState()
  store.setScenario(scenario)
  store.setCurrentFile(sidecarPath ?? null, name)
  store.setMapFile(mapPath ?? '', sidecarPath ?? '')
  store.setMapName(mapName)
  for (const [id, flow] of Object.entries(importedDialogs)) store.setDialogFlow(id, flow)
  if (Object.keys(importedLocalization).length > 0) {
    store.setLocalizationBatch(importedLocalization)
  }
  store.setTranslations(importedTranslations)
  for (const [heroSid, def] of Object.entries(importedCustomHeroes)) store.setCustomHero(heroSid, def)
  for (const [id, def] of Object.entries(importedCustomMapObjects)) store.setCustomMapObject(id, def)
  for (const [id, def] of Object.entries(importedCustomArtifacts)) store.setCustomArtifact(id, def)
  for (const [id, def] of Object.entries(importedCustomBuffs)) store.setCustomBuff(id, def)
  // setScenario() cleared the dirty flag; the hydration above must not resurrect it.
  store.markClean()

  return {
    name,
    mapPath,
    sidecarPath,
    sidecarLoaded,
    block4Used,
    warnings,
  }
}

/** Exposed for tests / consumers that need the sidecar path without opening a dialog. */
export { sidecarPathFor }
