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
  /** The untouched Core/DB/items/items/*.json array entry, kept as a clone
   *  template for custom artifact identities (issue #150) — same "raw here,
   *  resolved where shown" split as CatalogHero.raw/CatalogMapObject.raw.
   *  Only present when built from a real Core.zip — absent from the static
   *  fallback catalog. */
  raw?: Record<string, unknown>
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
  /** The untouched Core/DB/buffs/*.json array entry, kept as a clone
   *  template for custom buff identities (issue #165) — same "raw here,
   *  resolved where shown" split as CatalogArtifact.raw. Only present when
   *  built from a real Core.zip — absent from the static fallback catalog. */
  raw?: Record<string, unknown>
}

export interface CatalogMapObject {
  id: string
  name: string
  tag?: string
  category: 'interactables' | 'resources' | 'environments' | 'spawns'
    | 'animals' | 'fxs' | 'artifacts' | 'test' | 'blocks'
  isInteractable: boolean
  icon?: string
  /** Raw biome string from the object's own catalog entry (e.g. "Grass",
   *  "Desert", "Snow") — only `environments` (all 296) and most `animals`
   *  (27/33) entries carry this; every other category has none. Used by the
   *  Map Grid's object browser (issue #167) to filter decorations/units by
   *  terrain type. Confirmed distinct values: Grass, Desert, Deathland,
   *  Snow, Autumn, Lava, Dirt — the same 7 biomes tiles use
   *  (terrain-colors.ts's BIOME_NAMES), just "Desert" here vs. "Sand" there. */
  biome?: string
  /** Resolved via `${id}_description` in Core/Lang/english/texts/mapObjects.json
   *  (e.g. mine_crystals -> mine_crystals_description, "Produces {0} Crystals
   *  daily.") — only interactables/resources/spawns real entries carry one;
   *  pure decorations/fx/animals/blocks generally don't. Used by the Map
   *  Grid's object browser hover tooltip. */
  description?: string
  /** Footprint width/depth in tiles (Map Grid multi-tile rendering + blocked-
   *  tile overlay research) — promoted out of `raw` since most real objects
   *  are NOT 1×1 (confirmed: ~73% of 858 real templates are bigger). Default
   *  1×1 when absent, matching every real template that omits these. */
  sizeX?: number
  sizeZ?: number
  /** Per-cell footprint values, row-major, length `sizeX*sizeZ`: `1` = solid/
   *  blocked, `2` = walkable interaction cell, `0` = empty/unused. */
  nodes?: number[]
  /** Local `nodes[]` grid coordinate that aligns with wherever this object is
   *  actually placed on the map — default `0, 0` when absent, matching every
   *  real template that omits these (confirmed via `CustomObjectEditorDialog`'s
   *  already-tested `CORNER_1X1_PATTERNS`). */
  pivotX?: number
  pivotZ?: number
  /** The untouched Core/DB/map/objects/*.json entry, kept as a clone template
   *  for custom map object identities (issue #146) — same "raw here, resolved
   *  where shown" split as CatalogHero.raw. Only present when built from a
   *  real Core.zip — absent from the static fallback catalog. */
  raw?: Record<string, unknown>
}

export interface CatalogFaction {
  id: string
  name: string
  icon?: string
  /** Native terrain (e.g. "Grass", "Snow") from the faction's own DB entry.
   *  Used to backfill CatalogMapObject.biome for faction dwellings/city
   *  halls, which carry no biome field of their own. */
  biome?: string
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

/** A pre-built squad template (Core/DB/squads/**\/*.json), issue #143 — what
 *  objectsProperties.propRandomSquads.sids on a city/portal actually
 *  references for its garrison, NOT a raw creature sid. Has no display name
 *  of its own; `unitSids` (from randomSquad.units[].s) lets a consumer
 *  compose one by resolving real unit names via GameCatalog.creatures at
 *  render time, same "raw here, resolved where shown" split as
 *  CatalogSpecialization/reward-params.ts. */
export interface CatalogSquadTemplate {
  id: string
  fraction: string
  tier: number
  unitSids: string[]
}

/** An object behavior/logic definition (Core/DB/objects_logic/**\/*.json),
 *  issue #146 — the matching half of a CatalogMapObject template, read from a
 *  wildly non-uniform set of ~29 family subfolders (chests, event_banks,
 *  res_mines, cities, etc. — field shapes barely overlap between them, e.g.
 *  chests has `variants`, res_mines has `guardUnits`/`resValue`). Kept as an
 *  opaque raw bag here, same as CatalogHero.raw/CatalogMapObject.raw — a
 *  custom object clone only repoints `id` and ships the rest verbatim.
 *  `sourcePath` is the family subfolder the source file itself lives in
 *  (e.g. "event_banks") — confirmed required for a clone to actually work
 *  in-game: shipping it to a different/shared subfolder breaks the object
 *  (see issue #146 plan). Not every map object has a matching logic entry
 *  (pure decorations/environment objects may not); consumers handle absence. */
export interface CatalogObjectLogic {
  id: string
  sourcePath: string
  raw: Record<string, unknown>
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
  squadTemplates: CatalogSquadTemplate[]
  objectLogics: CatalogObjectLogic[]
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
// v5: added squadTemplates (issue #143), same hygiene-only reasoning.
// v6: added objectLogics + CatalogMapObject.raw, and fixed collectMapObjects
// to read an entry's own explicit `name` field before falling back to the
// `${id}_name` convention (issue #146) — hygiene-only bump, same reasoning.
// v7: added CatalogArtifact.raw, kept as a clone template for custom
// artifact identities (issue #150) — same hygiene-only reasoning.
// v8: added CatalogFaction.biome, and backfilled CatalogMapObject.biome for
// faction dwellings/city halls (interactables never had a biome field of
// their own) via a sid-token → faction-id → fractions.json.biome lookup —
// same hygiene-only reasoning.
// v9: added CatalogMapObject.description, resolved from the already-loaded
// Lang/english/texts/mapObjects.json via the `${id}_description` convention
// — same hygiene-only reasoning.
export const CATALOG_SCHEMA_VERSION = 9
