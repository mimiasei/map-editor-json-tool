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
  /** One line, for the hover title. */
  description: string
  /** Full explanation, for the info icon. */
  details: string
  /** `typeWinCondition` value. */
  type: number
}

export const WIN_CONDITIONS: readonly WinConditionInfo[] = [
  { id: 'classic', label: 'Classic', type: 0, description: 'Defeat every enemy.',
    details: 'The normal rule: a player wins by eliminating every enemy player. It stays available alongside the others, so you can combine it with extra ways to win.' },
  { id: 'capital-hold', label: 'Capital Hold', type: 3, description: 'Lose your starting city and you are out after a number of days.',
    details: 'A player who loses their starting city is eliminated unless they retake it within the set number of days. Set the days below. This makes the capital the thing to protect.' },
  { id: 'city-hold', label: 'City Hold', type: 8, description: 'Hold one marked neutral city for a number of days to win.',
    details: 'The generator marks one neutral city near the middle of the map. A player who owns it for the set number of days wins. "Reset cooldown" decides whether the countdown starts over when the city changes hands. With no neutral city on the map this condition is dropped (turn on random cities).' },
  { id: 'guardians-demise', label: "Guardian's Demise", type: 4, description: 'Lose your starting hero and you are out.',
    details: 'A player whose starting hero dies or is lost is eliminated. It has no settings.' },
  { id: 'final-battle', label: 'Final Battle', type: 5, description: 'A gladiator arena showdown after a delay.',
    details: 'The game opens a gladiator arena (called "Mode gladiator arena" in the game). "Registration start work" and "Registration start fight" are the two game switches for when players register and when fights begin. "Start delay" is how many days pass before it starts and "Count day" is the arena day count. The game does not label the two numbers, so check the result in the game.' },
  { id: 'tournament', label: 'Tournament', type: 9, description: 'A series of fights between players.',
    details: 'A series of scheduled fights. Each fight has an announce day (when it is announced) and a number of days (how long it runs). The number of fights is always odd (1, 3, 5, ...) so there is a clear winner: first to more than half of them wins. "Save army" keeps armies after fights.' },
]

export interface TournamentFight { announceDay: number; days: number }

/** The adjustable values behind the win conditions above. */
export interface WinOptions {
  capitalHoldDays: number
  cityHoldDays: number
  cityHoldResetCooldown: boolean
  finalBattle: { registrationStartWork: boolean; registrationStartFight: boolean; daysDelayStart: number; countDay: number }
  tournamentFights: TournamentFight[]
  tournamentSaveArmy: boolean
}

export const DEFAULT_WIN_OPTIONS: WinOptions = {
  capitalHoldDays: 3,
  cityHoldDays: 3,
  cityHoldResetCooldown: true,
  finalBattle: { registrationStartWork: false, registrationStartFight: true, daysDelayStart: 21, countDay: 3 },
  tournamentFights: [{ announceDay: 7, days: 3 }, { announceDay: 14, days: 3 }, { announceDay: 21, days: 3 }],
  tournamentSaveArmy: true,
}

/** Fights are added and removed two at a time so the count stays odd. */
export function addTournamentFights(fights: TournamentFight[]): TournamentFight[] {
  const last = fights[fights.length - 1] ?? { announceDay: 0, days: 3 }
  return [...fights, { announceDay: last.announceDay + 7, days: last.days }, { announceDay: last.announceDay + 14, days: last.days }]
}

export function removeTournamentFights(fights: TournamentFight[]): TournamentFight[] {
  return fights.length >= 3 ? fights.slice(0, fights.length - 2) : fights
}

/** Entry fields (on top of the editor's defaults) for one extra condition. */
export function winEntryFields(id: WinConditionId, options: WinOptions): Record<string, unknown> {
  switch (id) {
    case 'capital-hold': return { countDayLostStartCity: options.capitalHoldDays }
    case 'city-hold': return { countDayCityHold: options.cityHoldDays, isResetColdownCityHold: options.cityHoldResetCooldown }
    case 'final-battle': {
      const f = options.finalBattle
      return { isRegistrationStartWork: f.registrationStartWork, isRegistrationStartFight: f.registrationStartFight, daysDelayStart: f.daysDelayStart, countDayGladiatorArena: f.countDay }
    }
    case 'tournament': {
      const fights = options.tournamentFights
      return {
        daysAnounceTournament: fights.map((f) => f.announceDay),
        daysDelayStartFightTournament: fights.map((f) => f.days),
        countPointsTournament: Math.floor(fights.length / 2) + 1,
        isSaveArmyTournament: options.tournamentSaveArmy,
      }
    }
    default: return {}
  }
}

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
