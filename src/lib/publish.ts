// ─── One-step publish ─────────────────────────────────────────────────────────
// Shipping a map means putting two files in two different places:
//
//   1. the scenario JSON next to the binary .map file  (the game reads whichever
//      .json shares a folder with the map)
//   2. the map ZIP next to Core.zip in StreamingAssets (dialogs + localization)
//
// Both destinations are already known once a .map has been opened and Core.zip
// located, so this resolves them, reports whether they would overwrite, and lets
// the caller confirm before anything is written.

import { getStreamingAssetsDir, mapZipFileName, pathSep } from '@/lib/zip-export'
import { checkFileExists } from '@/lib/native-fs'

export interface PublishTarget {
  /** Absolute destination path, or null when it could not be derived. */
  path: string | null
  /** True when a file already sits at `path`. */
  exists: boolean
  /** Why `path` is null — shown in the UI next to a "Choose…" button. */
  reason?: string
}

export interface PublishTargets {
  json: PublishTarget
  zip: PublishTarget
}

export interface ResolveInput {
  /** Sidecar path tracked when a .map file was opened. */
  sidecarPath: string | null
  /** Path of the currently open JSON, used when no .map is involved. */
  currentFilePath: string | null
  mapName: string
}

/**
 * Work out where publishing would write. Never throws and never writes; a target
 * that cannot be derived comes back with `path: null` and a reason.
 */
export async function resolvePublishTargets({
  sidecarPath,
  currentFilePath,
  mapName,
}: ResolveInput): Promise<PublishTargets> {
  // ── Scenario JSON ─────────────────────────────────────────────────────────
  const jsonPath = sidecarPath || currentFilePath || null
  const json: PublishTarget = {
    path: jsonPath,
    exists: jsonPath ? await checkFileExists(jsonPath) : false,
    reason: jsonPath
      ? undefined
      : 'No file path yet — open a .map file or save the scenario once.',
  }

  // ── Map ZIP ───────────────────────────────────────────────────────────────
  const dir = getStreamingAssetsDir()
  let zip: PublishTarget

  if (!mapName.trim()) {
    zip = { path: null, exists: false, reason: 'Map name is required to name the ZIP.' }
  } else if (!dir) {
    zip = {
      path: null,
      exists: false,
      reason: 'StreamingAssets folder unknown — load Core.zip via Game Data first.',
    }
  } else {
    const zipPath = `${dir}${pathSep(dir)}${mapZipFileName(mapName)}`
    zip = { path: zipPath, exists: await checkFileExists(zipPath) }
  }

  return { json, zip }
}

/** True when both destinations are known and publishing can proceed. */
export function targetsReady(targets: PublishTargets): boolean {
  return !!targets.json.path && !!targets.zip.path
}
