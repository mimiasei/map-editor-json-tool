// ─── Recently opened files (File > Open Recent...) ───────────────────────────
// Desktop only: a file opened from the browser has no path to reopen. Kept in localStorage, newest first, so it survives restarts without
// a new Rust command. The list is advisory: a file may have been moved or deleted since, which the dialog finds out when you click it.

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
