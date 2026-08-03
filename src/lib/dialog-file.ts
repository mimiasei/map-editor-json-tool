// ─── Shipped dialog file shape ────────────────────────────────────────────────
// The game reads one file per dialog flow, wrapped in an "array" property:
//   DB/dialogs/dialogs/custom_maps/<map>/<dialogId>.json
//   { "array": [ { "id": …, "localization": true, "slides": [ … ] } ] }
//
// Both the ZIP export and the editable JSON preview column go through here, so
// what the user reviews is byte-for-byte what ships.

import type { DialogFlow } from '@/types/dialog'

/** Serialize one dialog flow into the game's per-dialog file format. */
export function serializeDialogFile(flow: DialogFlow): string {
  return JSON.stringify({ array: [flow] }, null, '\t')
}

export interface ParseDialogFileResult {
  flow: DialogFlow | null
  errors: string[]
}

/**
 * Parse a dialog file back into a flow. Accepts both the wrapped `{array:[flow]}`
 * form and a bare flow object, so hand-pasted content from the game's files works
 * either way. Structural problems are reported as errors rather than thrown.
 */
export function parseDialogFile(text: string): ParseDialogFileResult {
  const errors: string[] = []

  // Strip UTF-8 BOM if present (game files are saved with one)
  const jsonText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
    return { flow: null, errors }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('Expected a JSON object at the top level.')
    return { flow: null, errors }
  }

  const obj = raw as Record<string, unknown>

  // Unwrap { array: [flow] } — the shipped form
  let candidate: Record<string, unknown> = obj
  if ('array' in obj) {
    const arr = obj['array']
    if (!Array.isArray(arr)) {
      errors.push('"array" must be an array containing exactly one dialog flow.')
      return { flow: null, errors }
    }
    if (arr.length === 0) {
      errors.push('"array" is empty — expected one dialog flow.')
      return { flow: null, errors }
    }
    if (arr.length > 1) {
      errors.push(
        `"array" holds ${arr.length} flows — this editor stores one flow per file. Keep only the first.`,
      )
      return { flow: null, errors }
    }
    const first = arr[0]
    if (!first || typeof first !== 'object' || Array.isArray(first)) {
      errors.push('The entry inside "array" must be a dialog flow object.')
      return { flow: null, errors }
    }
    candidate = first as Record<string, unknown>
  }

  if (typeof candidate['id'] !== 'string' || !candidate['id']) {
    errors.push('Dialog flow is missing a non-empty string "id".')
  }
  if (!Array.isArray(candidate['slides'])) {
    errors.push('Dialog flow is missing a "slides" array.')
  }

  if (errors.length > 0) return { flow: null, errors }

  return { flow: candidate as unknown as DialogFlow, errors }
}
