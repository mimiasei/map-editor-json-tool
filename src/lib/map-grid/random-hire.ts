// A random-hire's faction and tier (objectsProperties.propRandomHires: { tier, fraction }).
// `fraction` is a number from the game's EPropFraction enum, read from the IL2CPP metadata (field order and default values):
// KeyObject 0, Node 1, Human 2, Undead 3, Dungeon 4, Nature 5, Demon 6, Unfrozen 7, Gnome 8, Neutral 9.
// A GME-made map (test_random_hire.map) with one hire set to KeyObject and one to Node gave both the faction native to the biome they stood
// on (human on grass, dungeon on dirt, neutral on sand). Every shipped/GME-default hire stores 0, so 0 is the default here too.
// Gnome is in GME's dropdown but a hire set to it did not appear in the game, so it is not offered.

export const RANDOM_HIRE_BIOME_FRACTION = 0

/** Faction id (as in the catalog) -> EPropFraction value. */
export const RANDOM_HIRE_FRACTION_BY_FACTION: Record<string, number> = {
  human: 2,
  undead: 3,
  dungeon: 4,
  nature: 5,
  demon: 6,
  unfrozen: 7,
  neutral: 9,
}

export const RANDOM_HIRE_TIERS = [1, 2, 3, 4, 5, 6, 7] as const

export function factionOfRandomHireFraction(fraction: number): string | null {
  return Object.entries(RANDOM_HIRE_FRACTION_BY_FACTION).find(([, value]) => value === fraction)?.[0] ?? null
}
