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
  /** The untouched hero definition JSON entry (Core/DB/heroes/**\/*.json),
   *  kept as a clone template for custom hero identities (issue #139) — a
   *  real map-authored hero, e.g. Core/DB/heroes/custom_maps/cm_fun_hero_1.json,
   *  is just this same shape with different name/description/motto sids.
   *  Only present when built from a real Core.zip — absent from the static
   *  fallback catalog (src/lib/catalog/static-catalog.ts). */
  raw?: Record<string, unknown>
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
  description?: string
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
    | 'animals' | 'fxs' | 'artifacts' | 'test' | 'blocks'
  isInteractable: boolean
  icon?: string
}

export interface CatalogFaction {
  id: string
  name: string
  icon?: string
}

/** A hero specialization (Core/DB/heroes_specializations/*.json), issue #141.
 *  No display name of its own worth resolving here — `name`/`desc` on the raw
 *  entry are just more loc sids for the specialization's own text, not a
 *  hero's identity. `forHeroSid` (the hero id embedded in this sid's own
 *  prefix, e.g. "human_hero_1_specialization" -> "human_hero_1") is what
 *  lets a consumer show "the actual hero display name" the sid was written
 *  for, by looking it up in `GameCatalog.heroes` — done at the UI layer
 *  rather than here, same "raw here, resolved where it's shown" split used
 *  elsewhere (e.g. src/lib/map-grid/reward-params.ts). */
export interface CatalogSpecialization {
  id: string
  forHeroSid: string
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

/** A speaker title SID with its resolved English display name. */
export interface CatalogSpeakerTitle {
  sid: string
  name: string
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
  specializations: CatalogSpecialization[]
  dialogs: CatalogDialog[]
  /** Avatar icon paths used by shipped dialogs — feeds the avatar strip combobox. */
  dialogAvatarIcons: string[]
  /** Known `dialogue_title_*` speaker SIDs with resolved English names. */
  speakerTitles: CatalogSpeakerTitle[]
}

// v3: mapObjects now covers all 9 DB/map/objects/*.json category files
// (previously only 4), and derives icons for every category, not just
// interactables/resources (issue #122).
// v4: added specializations (issue #141) — nothing persists/caches a built
// catalog across sessions, so this bump is hygiene only, not a migration.
export const CATALOG_SCHEMA_VERSION = 4
