// ─── Game Data Catalog — TypeScript interfaces ────────────────────────────────
// All catalog types include an `icon` SID for future thumbnail support (issue #62).
// The `thumbnailPath()` utility (thumbnails.ts) will resolve these to PNG paths
// once thumbnails are extracted — no UI changes needed at that point.

export interface CatalogHero {
  id: string
  name: string       // resolved English name from heroInfo.json
  fraction: string   // e.g. "human", "undead"
  icon: string       // icon SID — used by thumbnailPath() in issue #62
  classType?: string
}

export interface CreatureStats {
  hp: number
  offence: number
  defence: number
  damageMin: number
  damageMax: number
  initiative: number
  speed: number
  luck?: number
  moral?: number
  actionPoints?: number
  numCounters?: number
  energyPerCast?: number
  energyPerRound?: number
  energyPerTakeDamage?: number
}

export interface CatalogCreature {
  id: string
  name: string       // resolved via {id}_name in unitsAbility.json
  fraction: string
  tier: number
  icon?: string
  stats?: CreatureStats
  cost?: { resource: string; amount: number }[]
  squadValue?: number
  nativeBiome?: string
  baseSid?: string
  upgradeSid?: string
  aiType?: string
}

export interface CatalogArtifact {
  id: string
  name: string
  icon: string
  slot?: string
  rarity?: string
  description?: string
}

export interface CatalogSpell {
  id: string
  name: string
  icon: string
  school?: string
  rank?: number
}

export interface CatalogSkill {
  id: string
  name: string
  icon?: string
}

export interface CatalogBuff {
  id: string
  name: string
  icon?: string
}

export interface CatalogMapObject {
  id: string
  name: string
  tag?: string
  category: 'interactables' | 'resources' | 'environments' | 'spawns'
  isInteractable: boolean
  icon?: string
}

export interface CatalogFaction {
  id: string
  name: string
  icon?: string
}

export interface CatalogDialogSlide {
  id: string
  text?: string        // resolved English text
  speakerName?: string // resolved from title.sid via dialogues.json
}

export interface CatalogDialog {
  id: string
  slideCount: number
  firstText?: string   // first slide text preview for search
  slides: CatalogDialogSlide[]
}

export interface GameCatalog {
  /** Schema version — bump on breaking changes */
  version: number
  generatedAt: string
  /** Human-readable hint about where Core.zip was found */
  sourceHint: string
  heroes: CatalogHero[]
  creatures: CatalogCreature[]
  artifacts: CatalogArtifact[]
  spells: CatalogSpell[]
  skills: CatalogSkill[]
  buffs: CatalogBuff[]
  mapObjects: CatalogMapObject[]
  factions: CatalogFaction[]
  dialogs: CatalogDialog[]
}

export const CATALOG_SCHEMA_VERSION = 1
