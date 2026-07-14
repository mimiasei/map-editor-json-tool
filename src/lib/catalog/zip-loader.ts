// ─── Core.zip discovery and loading ──────────────────────────────────────────
// Finds and reads Core.zip from the appropriate source depending on platform.
//
// Priority order:
// 1. Tauri + Windows: probe default Steam install paths
// 2. Tauri (all platforms): Core.zip next to the binary (developer local copy)
// 3. Web: returns null — user must call loadFromFile() manually
//
// Core.zip is a copyrighted game asset and must NEVER be committed to the repo
// or written to any persistent location by this code.

import JSZip from 'jszip'
import { isTauri } from '@/lib/native-fs'

// ─── Steam install path candidates (Windows only) ────────────────────────────

const STEAM_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Heroes of Might & Magic Olden Era',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Heroes of Might and Magic Olden Era',
  'C:\\Program Files\\Steam\\steamapps\\common\\Heroes of Might & Magic Olden Era',
  'C:\\Program Files\\Steam\\steamapps\\common\\Heroes of Might and Magic Olden Era',
]

const APP_INFO_SUFFIX = 'HeroesOldenEra_Data/app.info'
const CORE_ZIP_SUFFIX = 'HeroesOldenEra_Data/StreamingAssets/Core.zip'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read a ZIP entry as UTF-8 text, stripping BOM if present. */
export async function readZipEntry(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path)
  if (!entry) throw new Error(`Entry not found in zip: ${path}`)
  const text = await entry.async('text')
  return text.startsWith('\uFEFF') ? text.slice(1) : text
}

/** Read a ZIP entry as JSON, returning null if the entry is missing. */
export async function readZipJson(zip: JSZip, path: string): Promise<unknown | null> {
  try {
    const text = await readZipEntry(zip, path)
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ─── Core.zip auto-discovery ─────────────────────────────────────────────────

/**
 * Attempts to find and load Core.zip automatically.
 *
 * Returns:
 * - `{ zip, sourceHint }` on success
 * - `null` if not found (web build or no install detected)
 *
 * On the web build, always returns null — use `loadZipFromFile()` instead.
 */
export async function findCoreZip(): Promise<{ zip: JSZip; sourceHint: string } | null> {
  if (!isTauri()) return null

  try {
    const { exists, readFile } = await import('@tauri-apps/plugin-fs')

    // 1. Probe Steam install paths (Windows)
    for (const base of STEAM_PATHS) {
      const infoPath = `${base}/${APP_INFO_SUFFIX}`.replace(/\//g, '\\')
      try {
        if (await exists(infoPath)) {
          const zipPath = `${base}/${CORE_ZIP_SUFFIX}`.replace(/\//g, '\\')
          const bytes = await readFile(zipPath)
          const zip = await JSZip.loadAsync(bytes)
          return { zip, sourceHint: 'Steam install' }
        }
      } catch {
        // not found at this path — try next
      }
    }

    // 2. Fallback: Core.zip next to binary (developer copy, never committed)
    const { resourceDir } = await import('@tauri-apps/api/path')
    const resDir = await resourceDir()
    const fallbackPath = `${resDir}Core.zip`
    try {
      if (await exists(fallbackPath)) {
        const bytes = await readFile(fallbackPath)
        const zip = await JSZip.loadAsync(bytes)
        return { zip, sourceHint: 'resource directory' }
      }
    } catch {
      // not found
    }
  } catch {
    // Tauri FS API unavailable (shouldn't happen but be safe)
  }

  return null
}

/**
 * Loads Core.zip from a user-provided File object (web build or manual override).
 * The file is read entirely in memory and never written to disk.
 */
export async function loadZipFromFile(file: File): Promise<{ zip: JSZip; sourceHint: string }> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)
  return { zip, sourceHint: `user file: ${file.name}` }
}

/**
 * Loads Core.zip from a filesystem path (Tauri manual override).
 * The chosen path should be saved in settings by the caller.
 */
export async function loadZipFromPath(
  filePath: string,
): Promise<{ zip: JSZip; sourceHint: string }> {
  if (!isTauri()) throw new Error('loadZipFromPath is only available in the Tauri build')
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const bytes = await readFile(filePath)
  const zip = await JSZip.loadAsync(bytes)
  return { zip, sourceHint: `manual path: ${filePath}` }
}
