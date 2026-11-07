// ─── Prefab library: saved copies of object groups, kept per user ──────────────
// A prefab is an ObjectClipboard with a name. They live in the app's localStorage (the desktop webview keeps it across restarts, like the recent-files
// list) and travel between machines as a small JSON file. Imported files are untrusted: every field is rebuilt from known, type-checked values, and
// objects whose sid the current game data lacks are dropped when the prefab is put on the clipboard.

import type { ClipboardItem, ClipboardProps, ObjectClipboard } from '@/lib/map-grid/clipboard'

export interface Prefab {
  id: string
  name: string
  /** ms since epoch. */
  savedAt: number
  clip: ObjectClipboard
}

export const PREFAB_FILE_FORMAT = 'tse-prefabs'
export const PREFAB_FILE_VERSION = 1

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

function cleanProps(raw: unknown): ClipboardProps {
  const props: ClipboardProps = {}
  if (!isObject(raw)) return props
  if (isInt(raw.owner)) props.owner = raw.owner
  if (Array.isArray(raw.guardUnitProps)) {
    const units = raw.guardUnitProps.filter((u): u is { sid: string; count: number } => isObject(u) && typeof u.sid === 'string' && isInt(u.count))
    if (units.length > 0) props.guardUnitProps = units.map((u) => ({ sid: u.sid, count: u.count }))
  }
  if (isInt(raw.randomSquadValue)) props.randomSquadValue = raw.randomSquadValue
  if (typeof raw.randomSquadFraction === 'string') props.randomSquadFraction = raw.randomSquadFraction
  if (isInt(raw.randomHireTier)) props.randomHireTier = raw.randomHireTier
  if (isInt(raw.randomHireFraction)) props.randomHireFraction = raw.randomHireFraction
  if (isStringArray(raw.rewardParams) && raw.rewardParams.length > 0) props.rewardParams = [...raw.rewardParams]
  if (typeof raw.displayName === 'string' && raw.displayName) props.displayName = raw.displayName
  if (typeof raw.description === 'string' && raw.description) props.description = raw.description
  return props
}

function cleanItem(raw: unknown): ClipboardItem | null {
  if (!isObject(raw)) return null
  if ((raw.type !== 0 && raw.type !== 2) || typeof raw.sid !== 'string' || !raw.sid) return null
  if (!isInt(raw.dx) || !isInt(raw.dz) || !isInt(raw.rotation)) return null
  return { type: raw.type, sid: raw.sid, dx: raw.dx, dz: raw.dz, rotation: raw.rotation, decoration: raw.decoration === true, props: cleanProps(raw.props) }
}

function cleanClip(raw: unknown): ObjectClipboard | null {
  if (!isObject(raw) || !Array.isArray(raw.items) || !isInt(raw.width) || !isInt(raw.height) || raw.width < 1 || raw.height < 1) return null
  const items = raw.items.map(cleanItem).filter((i): i is ClipboardItem => i !== null)
  return items.length > 0 ? { items, width: raw.width, height: raw.height } : null
}

function cleanPrefab(raw: unknown): Prefab | null {
  if (!isObject(raw) || typeof raw.name !== 'string') return null
  const clip = cleanClip(raw.clip)
  if (!clip) return null
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newPrefabId(),
    name: raw.name.trim().slice(0, 80) || 'Prefab',
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : Date.now(),
    clip,
  }
}

export function newPrefabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** The valid prefabs of a stored or imported list; anything malformed is left out. */
export function cleanPrefabList(raw: unknown): Prefab[] {
  return Array.isArray(raw) ? raw.map(cleanPrefab).filter((p): p is Prefab => p !== null) : []
}

export function serializePrefabs(prefabs: Prefab[]): string {
  return JSON.stringify({ format: PREFAB_FILE_FORMAT, version: PREFAB_FILE_VERSION, prefabs }, null, 2)
}

/** The prefabs of an exported file, or null when the text is not one. */
export function parsePrefabFile(text: string): Prefab[] | null {
  try {
    const data: unknown = JSON.parse(text)
    if (!isObject(data) || data.format !== PREFAB_FILE_FORMAT || !Array.isArray(data.prefabs)) return null
    return cleanPrefabList(data.prefabs)
  } catch {
    return null
  }
}

/** The clip without objects whose sid is unknown to the loaded game data, plus how many were dropped. Offsets stay as saved. */
export function usableClip(clip: ObjectClipboard, knowsSid: (sid: string, type: 0 | 2) => boolean): { clip: ObjectClipboard | null; dropped: number } {
  const items = clip.items.filter((i) => knowsSid(i.sid, i.type))
  return { clip: items.length > 0 ? { ...clip, items } : null, dropped: clip.items.length - items.length }
}
