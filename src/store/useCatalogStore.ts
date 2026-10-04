// ─── Game Data Catalog store ──────────────────────────────────────────────────
// Not persisted — rebuilt on demand from Core.zip (~1–2 seconds max).
// On failure, store remains usable and all dropdowns fall back to hardcoded lists.

import { create } from 'zustand'
import { findCoreZip, loadZipFromFile, loadZipFromPath } from '@/lib/catalog/zip-loader'
import { buildCatalog } from '@/lib/catalog/builder'
import type { GameCatalog } from '@/lib/catalog/types'
import { loadRmgSchema } from '@/lib/rmg/rmg-schema'
import { getGameDir, streamingAssetsPath } from '@/lib/game-dir'
import { logInfo, logError } from '@/lib/logger'
import { isTauri } from '@/lib/native-fs'

/** Attach the game's RMG schema (map_schemas/Default.mrmg.json, next to
 *  Core.zip) to a freshly built catalog. Without a known Core.zip path (a
 *  browsed-for file), looks in the detected game folder. Never fails — falls
 *  back to the built-in copy of the values. */
async function withRmgSchema(catalog: GameCatalog, coreZipPath: string | null): Promise<GameCatalog> {
  let zipPath = coreZipPath
  if (!zipPath) {
    const gameDir = await getGameDir()
    if (gameDir) zipPath = streamingAssetsPath(gameDir, 'Core.zip')
  }
  const { schema, path, fromFile } = await loadRmgSchema(zipPath)
  if (path) logInfo(`RMG schema loaded from ${path} (${fromFile.length > 0 ? fromFile.join(', ') : 'no usable fields — built-in values'})`)
  else logInfo('RMG schema: Default.mrmg.json not found — using built-in values')
  return { ...catalog, rmgSchema: schema }
}

// ─── Manual-override path (Tauri) ─────────────────────────────────────────────
// Persisted to localStorage so the user doesn't need to re-select on each launch.

const OVERRIDE_PATH_KEY = 'oe-catalog-override-path'

function getSavedOverridePath(): string | null {
  try { return localStorage.getItem(OVERRIDE_PATH_KEY) } catch { return null }
}

function saveOverridePath(path: string | null): void {
  try {
    if (path) localStorage.setItem(OVERRIDE_PATH_KEY, path)
    else localStorage.removeItem(OVERRIDE_PATH_KEY)
  } catch { /* ignore */ }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface CatalogStore {
  catalog: GameCatalog | null
  loading: boolean
  error: string | null
  /** Path the user manually selected (Tauri only). Persisted to localStorage. */
  overridePath: string | null

  /**
   * Auto-discover Core.zip and build the catalog.
   * Checks the saved override path first, then auto-discovery.
   */
  load(): Promise<void>

  /** Build from a user-provided File object (web build or drag & drop). */
  loadFromFile(file: File): Promise<void>

  /** Build from a filesystem path (Tauri manual override). Saves the path. */
  loadFromPath(filePath: string): Promise<void>

  /** Clear the catalog (and optionally the override path). */
  clear(clearPath?: boolean): void
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  catalog: null,
  loading: false,
  error: null,
  overridePath: getSavedOverridePath(),

  async load() {
    if (get().loading) return
    set({ loading: true, error: null })
    try {
      // 1. Try saved override path first
      const override = get().overridePath
      if (override) {
        try {
          const { loadZipFromPath: lp } = await import('@/lib/catalog/zip-loader')
          const { zip, sourceHint } = await lp(override)
          const catalog = await withRmgSchema(await buildCatalog(zip, sourceHint), override)
          logInfo(`Catalog loaded from override path: ${sourceHint} (${catalog.heroes.length} heroes, ${catalog.creatures.length} creatures)`)
          set({ catalog, loading: false })
          return
        } catch (e) {
          logError(`Failed to load catalog from override path: ${String(e)}`)
          // Fall through to auto-discovery
        }
      }

      // 2. Auto-discover
      const result = await findCoreZip()
      if (!result) {
        if (isTauri()) {
          set({ loading: false, error: 'Core.zip not found. Load it manually via Game Data → Load Core.zip.' })
        } else {
          set({ loading: false })
        }
        return
      }
      const catalog = await withRmgSchema(await buildCatalog(result.zip, result.sourceHint), result.path)
      logInfo(`Catalog loaded (${catalog.heroes.length} heroes, ${catalog.spells.length} spells, ${catalog.dialogs.length} dialogs)`)
      set({ catalog, loading: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Catalog build failed: ${msg}`)
      set({ loading: false, error: msg })
    }
  },

  async loadFromFile(file: File) {
    set({ loading: true, error: null })
    try {
      const { zip, sourceHint } = await loadZipFromFile(file)
      const catalog = await withRmgSchema(await buildCatalog(zip, sourceHint), null)
      logInfo(`Catalog loaded from file (${catalog.heroes.length} heroes)`)
      set({ catalog, loading: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Catalog build from file failed: ${msg}`)
      set({ loading: false, error: msg })
    }
  },

  async loadFromPath(filePath: string) {
    set({ loading: true, error: null, overridePath: filePath })
    saveOverridePath(filePath)
    try {
      const { zip, sourceHint } = await loadZipFromPath(filePath)
      const catalog = await withRmgSchema(await buildCatalog(zip, sourceHint), filePath)
      logInfo(`Catalog loaded from path: ${sourceHint}`)
      set({ catalog, loading: false })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Catalog build from path failed: ${msg}`)
      set({ loading: false, error: msg })
    }
  },

  clear(clearPath = false) {
    if (clearPath) {
      saveOverridePath(null)
      set({ catalog: null, error: null, overridePath: null })
    } else {
      set({ catalog: null, error: null })
    }
  },
}))
