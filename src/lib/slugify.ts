// ─── Display-name → SID slugification (issue #125 item 6) ───────────────────
// The game always treats objectsProperties.propsName.nameTitle as a
// localization SID lookup, never literal text — a value with no matching
// token renders in-game as "LOC:<value>". Instead of writing the display
// name text straight into nameTitle (the previous, buggy behavior), generate
// a real SID from it and register the text as that SID's localization token.

/** snake_case of up to the first 3 words, suffixed "_name_sid" (issue #130 —
 *  distinguishes an auto-generated display-name SID from other kinds of
 *  generated/authored SIDs at a glance). Collisions get a numeric suffix
 *  (_2, _3, ...) — no existing convention for this in the codebase to reuse
 *  (RenameEntitySidDialog just rejects duplicates outright). */
export function generateDisplayNameSid(text: string, existingSids: string[]): string {
  const words = text
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter((w) => w.length > 0)
    .slice(0, 3)

  const base = `${words.length > 0 ? words.join('_') : 'name'}_name_sid`
  if (!existingSids.includes(base)) return base

  let n = 2
  while (existingSids.includes(`${base}_${n}`)) n++
  return `${base}_${n}`
}
