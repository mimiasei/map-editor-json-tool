/**
 * Thin logging wrapper.
 *
 * On desktop (Tauri) log calls are routed to tauri-plugin-log, which writes
 * to a rotating file alongside any stdout output:
 *   macOS   ~/Library/Logs/com.oe.map-editor/
 *   Windows %LOCALAPPDATA%\com.oe.map-editor\logs\
 *   Linux   ~/.local/share/com.oe.map-editor/logs/
 *
 * In the browser all calls fall through to console.*.
 *
 * VERBOSE controls whether info/debug messages are emitted at all.
 * Warnings and errors are always emitted regardless of this flag.
 */

import { isTauri } from '@/lib/native-fs'

// ── Flag ──────────────────────────────────────────────────────────────────────

/** Set to false to suppress info/debug messages and emit only warn/error. */
export const VERBOSE = true

// ── Tauri log functions (lazy, loaded once) ───────────────────────────────────

type LogFn = (msg: string) => Promise<void>

interface TauriLog {
  info:  LogFn
  warn:  LogFn
  error: LogFn
  debug: LogFn
}

let _tauri: TauriLog | null = null

function getTauriLog(): TauriLog | null {
  if (!isTauri()) return null
  if (_tauri) return _tauri
  // Start async load; subsequent calls that arrive before it resolves are
  // silently dropped — acceptable since startup logs are low-priority.
  import('@tauri-apps/plugin-log').then((m) => {
    _tauri = { info: m.info, warn: m.warn, error: m.error, debug: m.debug }
  })
  return null
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Info-level — suppressed when VERBOSE is false. */
export function logInfo(msg: string): void {
  if (!VERBOSE) return
  const t = getTauriLog()
  if (t) { t.info(msg) } else { console.log(`[INFO] ${msg}`) }
}

/** Debug-level — suppressed when VERBOSE is false. */
export function logDebug(msg: string): void {
  if (!VERBOSE) return
  const t = getTauriLog()
  if (t) { t.debug(msg) } else { console.debug(`[DEBUG] ${msg}`) }
}

/** Warn-level — always emitted. */
export function logWarn(msg: string): void {
  const t = getTauriLog()
  if (t) { t.warn(msg) } else { console.warn(`[WARN] ${msg}`) }
}

/** Error-level — always emitted. */
export function logError(msg: string): void {
  const t = getTauriLog()
  if (t) { t.error(msg) } else { console.error(`[ERROR] ${msg}`) }
}
