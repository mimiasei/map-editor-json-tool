// ─── Draggable dialog geometry persistence ────────────────────────────────────
// Size and position for resizable modals, remembered across opens under
// `oe-dialog-<key>` — the same localStorage convention as oe-catalog-override-path
// and oe-setup-shown.
//
// Restores are always clamped to the current viewport: a box saved on a larger
// display, or before the window was shrunk, must never strand a dialog off-screen
// with an unreachable header.

export interface DialogGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** How much of the dialog must remain on screen for its header to stay grabbable. */
const MIN_VISIBLE_X = 120
const MIN_VISIBLE_Y = 40

export function dialogStorageId(key: string): string {
  return `oe-dialog-${key}`
}

/** Fit a box to the current viewport, never shrinking below the dialog's minimum. */
export function clampToViewport(
  g: DialogGeometry,
  minWidth: number,
  minHeight: number,
): DialogGeometry {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    width: Math.max(minWidth, Math.min(g.width, vw)),
    height: Math.max(minHeight, Math.min(g.height, vh)),
    x: Math.max(0, Math.min(g.x, vw - MIN_VISIBLE_X)),
    y: Math.max(0, Math.min(g.y, vh - MIN_VISIBLE_Y)),
  }
}

/**
 * Read a saved geometry, clamped to the viewport. Returns null when nothing is
 * stored or the value is unusable, so callers fall back to their centred defaults.
 */
export function readDialogGeometry(
  key: string,
  minWidth: number,
  minHeight: number,
): DialogGeometry | null {
  try {
    const raw = localStorage.getItem(dialogStorageId(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DialogGeometry>
    const fields = [parsed.x, parsed.y, parsed.width, parsed.height]
    if (!fields.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    return clampToViewport(parsed as DialogGeometry, minWidth, minHeight)
  } catch {
    // Unparseable, or localStorage unavailable — defaults are a fine outcome.
    return null
  }
}

export function writeDialogGeometry(key: string, g: DialogGeometry): void {
  try {
    localStorage.setItem(dialogStorageId(key), JSON.stringify(g))
  } catch {
    // Private mode or quota exceeded. Remembering geometry is a convenience, not
    // something worth breaking the dialog over.
  }
}
