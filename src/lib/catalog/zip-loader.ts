// ─── Core.zip discovery and loading ──────────────────────────────────────────
// Finds and reads Core.zip from the appropriate source depending on platform.
//
// Priority order:
// 1. Tauri: the game folder found by the app (game-dir.ts — the folder chosen
//    in the Windows installer, else the Steam library holding the game)
// 2. Tauri (all platforms): Core.zip next to the binary (developer local copy)
// 3. Web: returns null — user must call loadFromFile() manually
//
// Core.zip is a copyrighted game asset and must NEVER be committed to the repo
// or written to any persistent location by this code.

import JSZip from 'jszip'
import { isTauri } from '@/lib/native-fs'
import { getGameDir, streamingAssetsPath } from '@/lib/game-dir'

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
 * - `{ zip, sourceHint, path }` on success (`path` = the Core.zip file read)
 * - `null` if not found (web build or no install detected)
 *
 * On the web build, always returns null — use `loadZipFromFile()` instead.
 */
export async function findCoreZip(): Promise<{ zip: JSZip; sourceHint: string; path: string } | null> {
  if (!isTauri()) return null

  try {
    const { exists, readFile } = await import('@tauri-apps/plugin-fs')

    // 1. The detected game folder
    const gameDir = await getGameDir()
    if (gameDir) {
      const zipPath = streamingAssetsPath(gameDir, 'Core.zip')
      try {
        const zip = await JSZip.loadAsync(await readFile(zipPath))
        return { zip, sourceHint: `game folder: ${gameDir}`, path: zipPath }
      } catch {
        // unreadable — fall through to the developer copy
      }
    }

    // 2. Fallback: Core.zip next to binary (developer copy, never committed)
    const { resourceDir, join } = await import('@tauri-apps/api/path')
    const resDir = await resourceDir()
    const fallbackPath = await join(resDir, 'Core.zip')
    try {
      if (await exists(fallbackPath)) {
        const bytes = await readFile(fallbackPath)
        const zip = await JSZip.loadAsync(bytes)
        return { zip, sourceHint: 'resource directory', path: fallbackPath }
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
