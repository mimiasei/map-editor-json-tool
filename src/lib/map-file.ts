// ─── .map file orchestration ──────────────────────────────────────────────────
// Ties together: open dialog → binary parse → sidecar JSON check → load stores.
// This is the single entry point for "Open .map file".

import { openMapFile, checkFileExists, readTextFileAt } from '@/lib/native-fs'
import { parseMapFile } from '@/lib/map-parser'
import { extractMapContext, extractScenario } from '@/lib/map-extract'
import { importScenario } from '@/lib/import'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { logInfo, logWarn } from '@/lib/logger'

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

  // Convert empty path (browser) to null — empty string is not a valid path
  const mapPath = file.path || null

  const warnings: string[] = []

  // ── Parse binary ────────────────────────────────────────────────────────────
  const raw = await parseMapFile(file.buffer)
  logInfo(`Parsed .map: ${file.name}`)

  // ── Map context (always from .map binary) ────────────────────────────────────
  const context = extractMapContext(raw)
  useMapContextStore.getState().setContext(context)

  // ── Sidecar path — derived from native OS path, not forward-slash-normalized ─
  // Using the raw path preserves backslashes on Windows so Tauri FS calls work.
  const sidecarPath = mapPath ? sidecarPathFor(mapPath, file.name) : null

  let sidecarLoaded = false
  let block4Used = false
  let scenario = extractScenario(raw)   // default: Block 4
  let mapName = context.mapName
  let importedMapName = ''

  // ── Try sidecar (Tauri only — needs file system access) ──────────────────────
  if (sidecarPath && (await checkFileExists(sidecarPath))) {
    const text = await readTextFileAt(sidecarPath)
    if (text) {
      const { scenario: imported, errors, warnings: iw, mapName: mn } = importScenario(text)
      if (imported) {
        scenario = imported
        importedMapName = mn
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
    logWarn(`No sidecar found for ${file.name}, using Block 4 scripting data`)
  }

  // Use _mapName from sidecar if present, else Block 2 mapName
  if (importedMapName) mapName = importedMapName

  // ── Load scenario store ──────────────────────────────────────────────────────
  // currentFileName = the .map filename so the toolbar shows the correct name.
  // currentFilePath = sidecarPath so Ctrl+S knows where to write.
  const store = useScenarioStore.getState()
  store.setScenario(scenario)
  store.setCurrentFile(sidecarPath ?? null, file.name)
  store.setMapFile(mapPath ?? '', sidecarPath ?? '')
  store.setMapName(mapName)

  return {
    name: file.name,
    mapPath,
    sidecarPath,
    sidecarLoaded,
    block4Used,
    warnings,
  }
}

/** Exposed for tests / consumers that need the sidecar path without opening a dialog. */
export { sidecarPathFor }
