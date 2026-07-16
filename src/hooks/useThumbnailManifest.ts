// ─── Thumbnail manifest singleton ────────────────────────────────────────────
// Loads AppLocalData/thumbnails/manifest.json once on first call and stores the
// known icon IDs in a Set for synchronous lookup in thumbnailPath().

import { isTauri } from '@/lib/native-fs'

let knownIcons: Set<string> | null = null
// In-flight promise so concurrent callers all await the same load, not just
// the first. Without this, callers that hit `loading === true` would return
// immediately before the manifest was actually ready.
let inflightPromise: Promise<void> | null = null
let listeners: Array<() => void> = []

/** Returns true if the manifest has been loaded and the icon ID is present. */
export function isIconKnown(iconId: string): boolean {
  return knownIcons?.has(iconId.toLowerCase()) ?? false
}

/** Returns true if the manifest has been loaded (even if empty). */
export function isManifestLoaded(): boolean {
  return knownIcons !== null
}

/** Returns the number of known icon IDs. 0 means no thumbnails extracted yet. */
export function getThumbnailCount(): number {
  return knownIcons?.size ?? 0
}

/**
 * Load (or reload) the thumbnail manifest from AppLocalData.
 * Safe to call multiple times — concurrent callers all await the same in-flight
 * load rather than returning prematurely. No-ops on the web build.
 */
export async function loadThumbnailManifest(): Promise<void> {
  if (!isTauri()) return
  if (inflightPromise) return inflightPromise

  inflightPromise = (async () => {
    try {
      const { appLocalDataDir } = await import('@tauri-apps/api/path')
      const { readTextFile } = await import('@tauri-apps/plugin-fs')

      const rawDir = await appLocalDataDir()
      // Normalise to forward slashes and guarantee a trailing separator
      const dir = rawDir.replace(/\\/g, '/').replace(/\/?$/, '/')
      const manifestPath = `${dir}thumbnails/manifest.json`

      const text = await readTextFile(manifestPath)
      const list: string[] = JSON.parse(text)
      knownIcons = new Set(list.map((id) => id.toLowerCase()))
    } catch {
      // Manifest doesn't exist yet — that's fine, thumbnails just won't show
      knownIcons = new Set()
    } finally {
      inflightPromise = null
      // Notify any subscribers
      for (const cb of listeners) cb()
      listeners = []
    }
  })()

  return inflightPromise
}

/**
 * Register a callback to be called once when the manifest finishes loading.
 * Used by components that need to re-render after the manifest arrives.
 */
export function onManifestLoaded(cb: () => void): void {
  if (knownIcons !== null) {
    cb()
  } else {
    listeners.push(cb)
  }
}
