// ─── Win conditions the generator can write ─────────────────────────────────
// `settings.mapWinConditions[].typeWinCondition` ints, confirmed from maps
// saved in the game's own map editor (one condition added to a Classic-only
// baseline at a time). The in-game RMG calls 3 "Capital Hold" and 4
// "Guardian's Demise" (the editor says LostStartCity / LostStartHero).

export const WIN_CONDITION_IDS = ['classic', 'capital-hold', 'city-hold', 'guardians-demise', 'final-battle', 'tournament'] as const
export type WinConditionId = (typeof WIN_CONDITION_IDS)[number]

export interface WinConditionInfo {
  id: WinConditionId
  label: string
  description: string
  /** `typeWinCondition` value. */
  type: number
  /** Field values written on this condition's entry, on top of the editor's defaults. */
  fields?: Record<string, unknown>
}

export const WIN_CONDITIONS: readonly WinConditionInfo[] = [
  { id: 'classic', label: 'Classic', type: 0, description: 'Defeat every enemy.' },
  { id: 'capital-hold', label: 'Capital Hold', type: 3, fields: { countDayLostStartCity: 3 }, description: 'Lose your starting city and you are out after 3 days unless you retake it.' },
  { id: 'city-hold', label: 'City Hold', type: 8, fields: { countDayCityHold: 3, isResetColdownCityHold: true }, description: 'Hold one marked neutral city for 3 days to win. The generator marks a neutral city near the middle of the map.' },
  { id: 'guardians-demise', label: "Guardian's Demise", type: 4, description: 'Lose your starting hero and you are out.' },
  { id: 'final-battle', label: 'Final Battle', type: 5, fields: { countDayGladiatorArena: 3, daysDelayStart: 21 }, description: 'Gladiator arena showdown after a delay.' },
  { id: 'tournament', label: 'Tournament', type: 9, fields: { countPointsTournament: 2 }, description: 'Win tournament fights to a number of points.' },
]

export function winConditionById(id: WinConditionId): WinConditionInfo {
  return WIN_CONDITIONS.find((c) => c.id === id)!
}

/** Parses a `--win` list; empty means "no change" (undefined). */
export function parseWinConditionList(raw: string | undefined): WinConditionId[] | undefined {
  const parts = raw?.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean) ?? []
  if (parts.length === 0) return undefined
  const ids = parts.map((p) => {
    const hit = WIN_CONDITION_IDS.find((id) => id === p)
    if (!hit) throw new Error(`--win must be a comma list of: ${WIN_CONDITION_IDS.join(', ')} (got "${p}")`)
    return hit
  })
  return [...new Set(ids)]
}
