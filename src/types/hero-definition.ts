// ─── Full hero definition — typed editor form state (issue #141) ────────────
// Matches the real key set/shapes confirmed across every hero JSON in
// Core/DB/heroes/**/*.json (108 real-faction heroes across 6 factions, plus
// campaign/campaign_tutorial/custom_maps). This type exists purely for the
// hero-editor dialog's own form state — the actual stored/shipped shape
// (CustomHeroDefinition.definition in src/types/hero.ts) stays
// `Record<string, unknown>` by design, since it also has to carry through
// whatever a cloned hero already had that this dialog doesn't expose
// (statsRolls) or that a future game update might add.

export interface HeroSquadEntry {
  sid: string
  min: number
  max: number
}

export interface HeroSkillEntry {
  sid: string
  skillLevel: number
}

export interface HeroMagicEntry {
  sidConfig: string
  level: number
  isLearned: boolean
}

export interface HeroStats {
  viewRadius: number
  statsNum: number
  magicCastsPerRound: number
  enableTactics: boolean
  tacticsPlacementSize: number
  enableHeroNativeBiome: boolean
  offence: number
  defence: number
  spellPower: number
  intelligence: number
  luck: number
  moral: number
}

export interface HeroDefinitionFields {
  id: string
  /** Localization sid — same "auto-managed SID + text" convention as the
   *  rest of this app's naming fields. */
  name: string
  description: string
  motto: string
  mesh: string
  mounts: string[]
  icon: string
  fraction: string
  nativeBiome: string
  classType: 'might' | 'magic'
  skillsRollVariant: string
  costGold: number
  startLevel: number
  attacksTimesBefore: number[]
  startSquad: HeroSquadEntry[]
  startSquadAlt: HeroSquadEntry[]
  specialization: string
  stats: HeroStats
  /** Never shown/edited in the dialog (issue #141) — carried through
   *  verbatim from whichever real hero this was seeded from. */
  statsRolls: unknown
  startSkills: HeroSkillEntry[]
  startMagics: HeroMagicEntry[]
}
