// ─── Auto-update (Tauri desktop only) ─────────────────────────────────────────
// Wraps tauri-plugin-updater so components never import @tauri-apps/plugin-*
// directly — same rule as src/lib/native-fs.ts. Every call is a dynamic import
// inside an isTauri() guard.
//
// Update artifacts are published as GitHub release assets and discovered through
// latest.json; see plugins.updater.endpoints in src-tauri/tauri.conf.json. Only
// published (non-draft) releases are reachable, so a drafted release stays
// invisible to users until it is published.

import { isTauri } from '@/lib/native-fs'
import { logError, logInfo, logWarn } from '@/lib/logger'
import { writeSessionHandoff } from '@/lib/session-handoff'

export interface AvailableUpdate {
  /** Version being offered, e.g. "0.6.6". */
  version: string
  /** Current running version. */
  currentVersion: string
  /** Release notes from latest.json — markdown. */
  notes: string
  /** Publication date string as provided by the manifest, if any. */
  date: string | null
}

export type CheckOutcome =
  | { status: 'update'; update: AvailableUpdate }
  | { status: 'current'; currentVersion: string }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }

/** Progress of a running download, 0–1, or null while the size is unknown. */
export type ProgressCallback = (fraction: number | null) => void

// ─── Availability ─────────────────────────────────────────────────────────────

/**
 * Updates only make sense in a packaged desktop build. Dev builds are excluded
 * deliberately: the running version equals the released one, so a check is pure
 * noise, and installing over a dev build makes no sense.
 */
export function isUpdaterAvailable(): boolean {
  return isTauri() && !import.meta.env.DEV
}

/** Running app version, or null in the browser. */
export async function getCurrentVersion(): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { getVersion } = await import('@tauri-apps/api/app')
    return await getVersion()
  } catch {
    return null
  }
}

// ─── Check ────────────────────────────────────────────────────────────────────

/**
 * Ask the endpoint whether a newer version exists.
 *
 * Never throws. A failed check — offline, GitHub down, no release published yet —
 * comes back as `error` and is logged; it must never disrupt startup.
 */
export async function checkForUpdate(): Promise<CheckOutcome> {
  if (!isUpdaterAvailable()) return { status: 'unsupported' }

  const currentVersion = (await getCurrentVersion()) ?? 'unknown'

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()

    if (!update) {
      logInfo(`Update check: already on the latest version (${currentVersion}).`)
      return { status: 'current', currentVersion }
    }

    logInfo(`Update check: ${update.version} available (running ${currentVersion}).`)
    return {
      status: 'update',
      update: {
        version: update.version,
        currentVersion,
        notes: update.body ?? '',
        date: update.date ?? null,
      },
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logWarn(`Update check failed: ${message}`)
    return { status: 'error', message }
  }
}

// ─── Install ──────────────────────────────────────────────────────────────────

/**
 * Download and install the pending update, then restart.
 *
 * The project is written to a hand-off file first, because this call does not
 * return: on Windows the installer force-exits the app mid-install, and on macOS
 * the bundle is replaced and relaunched. The next launch picks the hand-off up.
 *
 * Throws if the hand-off could not be written — better to abort an update than to
 * lose the user's work.
 */
export async function installUpdate(onProgress?: ProgressCallback): Promise<void> {
  if (!isUpdaterAvailable()) {
    throw new Error('Updates are only available in the packaged desktop app.')
  }

  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) {
    throw new Error('The update is no longer available — try checking again.')
  }

  // Must happen before downloadAndInstall: on Windows we never get control back.
  await writeSessionHandoff('update')

  let contentLength = 0
  let downloaded = 0

  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength ?? 0
        downloaded = 0
        onProgress?.(contentLength > 0 ? 0 : null)
        break
      case 'Progress':
        downloaded += event.data.chunkLength
        // Some servers omit Content-Length; report indeterminate rather than a lie.
        onProgress?.(contentLength > 0 ? Math.min(downloaded / contentLength, 1) : null)
        break
      case 'Finished':
        onProgress?.(1)
        break
    }
  })

  logInfo('Update installed — restarting.')

  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch (e) {
    // Windows usually exits during install, so relaunch never runs. Reaching here
    // with an error means the update is installed but we could not restart —
    // say so rather than appearing to hang.
    logError(`Update installed but relaunch failed: ${e instanceof Error ? e.message : String(e)}`)
    throw new Error('Update installed. Please restart the app manually to finish.')
  }
}
