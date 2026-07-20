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
  /** Absolute path to the .map file (empty string in browser) */
  mapPath: string
  /** Absolute path to the sidecar .json (may be same dir, empty in browser) */
  sidecarPath: string
  /** Whether the sidecar JSON was found and used */
  sidecarLoaded: boolean
  /** Whether Block 4 fallback was used (no sidecar) */
  block4Used: boolean
  /** Non-fatal warnings (sidecar parse issues, etc.) */
  warnings: string[]
}

/**
 * Show an open dialog for .map files, parse the binary, load the sidecar JSON
 * (or fall back to Block 4), and populate both the scenario store and the map
 * context store. Returns null if the user cancels.
 */
export async function openAndLoadMapFile(): Promise<OpenMapResult | null> {
  const file = await openMapFile()
  if (!file) return null

  const warnings: string[] = []

  // ── Parse binary ────────────────────────────────────────────────────────────
  const raw = await parseMapFile(file.buffer)
  logInfo(`Parsed .map: ${file.name}`)

  // ── Map context (always from .map binary) ────────────────────────────────────
  const context = extractMapContext(raw)
  useMapContextStore.getState().setContext(context)

  // ── Sidecar path = same dir, same stem, .json extension ─────────────────────
  const normalizedPath = file.path.replace(/\\/g, '/')
  const lastSlash = normalizedPath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash + 1) : ''
  const stem = file.name.replace(/\.map$/i, '')
  const sidecarPath = dir ? `${dir}${stem}.json` : ''

  let sidecarLoaded = false
  let block4Used = false
  let scenario = extractScenario(raw)   // default: Block 4
  let mapName = context.mapName
  let importedMapName = ''

  // ── Try sidecar (Tauri only — needs file system access) ──────────────────────
  if (sidecarPath && (await checkFileExists(sidecarPath))) {
    const text = await readTextFileAt(sidecarPath)
    if (text) {
      // Strip BOM (some sidecar files have it)
      const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
      const { scenario: imported, errors, warnings: iw, mapName: mn } = importScenario(clean)
      if (imported) {
        scenario = imported
        importedMapName = mn
        sidecarLoaded = true
        logInfo(`Loaded sidecar: ${stem}.json`)
      } else {
        warnings.push(...errors.map((e) => `Sidecar parse error: ${e}`))
        // fall through to Block 4
      }
      if (iw.length > 0) warnings.push(...iw.map((w) => `Sidecar warning: ${w}`))
    }
  }

  if (!sidecarLoaded) {
    // Block 4 fallback
    block4Used = true
    logWarn(`No sidecar found for ${file.name}, using Block 4 scripting data`)
  }

  // Use _mapName from sidecar if present, else Block 2 mapName
  if (importedMapName) mapName = importedMapName

  // ── Load scenario store ──────────────────────────────────────────────────────
  const store = useScenarioStore.getState()
  store.setScenario(scenario)
  store.setCurrentFile(sidecarPath || null, sidecarPath ? `${stem}.json` : file.name)
  store.setMapFile(file.path, sidecarPath)
  store.setMapName(mapName)

  return {
    name: file.name,
    mapPath: file.path,
    sidecarPath,
    sidecarLoaded,
    block4Used,
    warnings,
  }
}
