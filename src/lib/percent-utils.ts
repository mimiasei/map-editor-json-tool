// ─── Percent <-> decimal display helpers ───────────────────────────────────────
// Real game data stores percentages as decimal strings/numbers (0.15 = 15%).
// These convert to/from the friendly "type 15, mean 15%" number a non-technical
// user expects, used by both the artifact bonus and buff stat editors.

/** Convert a stored decimal ('0.15' or 0.15) to a display number ('15'). */
export function percentToDisplay(raw: string | number | undefined): string {
  if (raw === undefined || raw === '') return ''
  const n = Number(raw)
  return Number.isFinite(n) ? String(Math.round(n * 10000) / 100) : ''
}

/** Convert a display number ('15') back to the stored decimal string ('0.15'). */
export function displayToPercent(display: string): string {
  if (display === '') return ''
  const n = Number(display)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 10000) : '0'
}
