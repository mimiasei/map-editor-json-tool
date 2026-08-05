// ─── Scenario clipboard ───────────────────────────────────────────────────────
// Copy/paste triggers, actions, and subquests as JSON via the system clipboard —
// Tauri only, per the isTauri() guard convention in native-fs.ts. Works across
// separate app windows (and sessions) because it's the real OS clipboard, not
// in-memory app state.

import { useEffect, useState } from 'react'
import { isTauri } from '@/lib/native-fs'
import { logInfo, logWarn } from '@/lib/logger'

export type ClipboardKind = 'trigger' | 'action' | 'subquest'

/**
 * Envelope written to the clipboard instead of the bare JSON. Distinguishing `kind` is
 * what lets a "Paste Trigger" button ignore a copied Action (or an unrelated string
 * someone happened to have on their clipboard) instead of inserting garbage.
 */
interface ClipboardPayload<T> {
  __oeClipboard: ClipboardKind
  /** Bumped only if the envelope shape itself changes — not on scenario format changes. */
  version: 1
  data: T
}

const CURRENT_VERSION = 1

export async function copyToClipboard<T>(kind: ClipboardKind, data: T): Promise<void> {
  if (!isTauri()) return
  const payload: ClipboardPayload<T> = { __oeClipboard: kind, version: CURRENT_VERSION, data }
  try {
    const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
    await writeText(JSON.stringify(payload))
    logInfo(`Copied ${kind} to clipboard`)
  } catch (e) {
    logWarn(`Could not copy ${kind} to clipboard: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Validate raw clipboard text against the envelope shape for a specific kind. A pure
 * function (no Tauri dependency) so the "what counts as pasteable" logic — the part most
 * worth getting right, since it's what stands between a stray clipboard string and
 * inserting garbage into the scenario — can be unit tested directly.
 *
 * Returns null for anything that isn't valid JSON, isn't our envelope shape, or is the
 * wrong kind.
 */
export function parseClipboardEnvelope<T>(text: string | null, kind: ClipboardKind): T | null {
  if (!text) return null
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as Partial<ClipboardPayload<T>>).__oeClipboard !== kind ||
      (parsed as Partial<ClipboardPayload<T>>).version !== CURRENT_VERSION
    ) {
      return null
    }
    return (parsed as ClipboardPayload<T>).data
  } catch {
    // Not JSON — e.g. someone had a URL or plain text on the clipboard.
    return null
  }
}

/**
 * Read and validate clipboard content for a specific kind. The caller doesn't need its
 * own try/catch to handle "someone copied a URL" or "the clipboard plugin failed"
 * gracefully — both come back as null.
 */
export async function readClipboardPayload<T>(kind: ClipboardKind): Promise<T | null> {
  if (!isTauri()) return null
  try {
    const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
    const text = await readText()
    return parseClipboardEnvelope<T>(text, kind)
  } catch {
    // The clipboard plugin itself failed (permissions, empty clipboard on some
    // platforms, etc.) — "nothing pasteable" is the correct outcome either way.
    return null
  }
}

/**
 * Tracks whether the clipboard currently holds a pasteable payload of `kind`, so a
 * "Paste X" button can be shown only when there's actually something valid to paste.
 *
 * Re-checks on window focus (not just mount): the whole point of using the real OS
 * clipboard instead of in-memory state is that copying in one app window and pasting in
 * another — or a separate app session entirely — has to work, and focus is the only
 * reliable cross-platform signal that the clipboard might have changed since we last
 * looked.
 */
export function useClipboardHasPayload<T>(kind: ClipboardKind): T | null {
  const [payload, setPayload] = useState<T | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const check = () => {
      readClipboardPayload<T>(kind).then((p) => {
        if (!cancelled) setPayload(p)
      })
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      cancelled = true
      window.removeEventListener('focus', check)
    }
  }, [kind])

  return payload
}
