// ─── Recently opened files (File > Open Recent) ──────────────────────────────
// Desktop only: a file opened from the browser has no path to reopen. Kept in localStorage, newest first, so it survives restarts. The
// native File > Open Recent submenu is redrawn from it (syncRecentMenu) whenever it changes. The list is advisory: a file may have been
// moved or deleted since, which is found out when it is clicked.

import { isTauri } from '@/lib/native-fs'

export type RecentFileKind = 'map' | 'json'

export interface RecentFile {
  path: string
  name: string
  kind: RecentFileKind
  /** ms since epoch of the last time it was opened here. */
  openedAt: number
}

const STORAGE_KEY = 'oe:recent-files'
const MAX_RECENT = 20

function read(): RecentFile[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((e): e is RecentFile =>
      !!e && typeof e.path === 'string' && typeof e.name === 'string' && (e.kind === 'map' || e.kind === 'json') && typeof e.openedAt === 'number')
  } catch {
    return []
  }
}

function write(list: RecentFile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch { /* storage unavailable: the list just isn't kept */ }
  syncRecentMenu()
}

/** "name  (folder)": the folder tells apart two files of the same name. */
function menuLabel(f: RecentFile): string {
  const parts = f.path.replace(/\\/g, '/').split('/')
  const folder = parts.length > 1 ? parts[parts.length - 2] : ''
  return folder ? `${f.name}  (${folder})` : f.name
}

/** Redraws the native File > Open Recent submenu from the stored list. Also called once at startup. */
export function syncRecentMenu(): void {
  if (!isTauri()) return
  const files = getRecentFiles().map((f) => ({ path: f.path, label: menuLabel(f) }))
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('set_recent_files', { files }))
    .catch(() => undefined)
}

/** Most recently opened first. */
export function getRecentFiles(): RecentFile[] {
  return read().sort((a, b) => b.openedAt - a.openedAt)
}

/** Puts the file at the top of the list (a second open of the same path moves it, not duplicates it). */
export function recordRecentFile(path: string, kind: RecentFileKind): void {
  if (!path) return
  const name = path.replace(/\\/g, '/').split('/').pop() ?? path
  const rest = read().filter((e) => e.path !== path)
  write([{ path, name, kind, openedAt: Date.now() }, ...rest].sort((a, b) => b.openedAt - a.openedAt).slice(0, MAX_RECENT))
}

export function removeRecentFile(path: string): void {
  write(read().filter((e) => e.path !== path))
}

export function clearRecentFiles(): void {
  write([])
}
