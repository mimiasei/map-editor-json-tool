// ─── H3 object mapping — schema for the user-editable master table ──────────
// Validates h3-object-mapping.json at load time so a hand-edit that breaks
// the shape fails loudly right there, with a clear Zod message pointing at
// the bad row — not a silent misresolution three steps downstream in a
// converted map.

import { z } from 'zod'

export const SCENERY_ROLES = ['ground', 'pool', 'tree', 'shrub', 'pool_big', 'water_decoration', 'mountain', 'rock', 'ruin'] as const
export const OE_BIOMES = ['grass', 'snow', 'dirt', 'desert', 'dead', 'lava', 'water', 'sand'] as const
export const OBJECT_KINDS = ['town', 'portal', 'resource', 'mine', 'dwelling', 'artifact', 'random_squad', 'interactable', 'map_event', 'scenery'] as const

export const SceneryRoleSchema = z.enum(SCENERY_ROLES)
export const OeBiomeSchema = z.enum(OE_BIOMES)
export const ObjectKindSchema = z.enum(OBJECT_KINDS)

const BaseRow = { h3Id: z.number().int(), h3Name: z.string() }

/** No OE equivalent — omitted with a named, stable reason (surfaced in the
 *  import report's "Not converted" list). `onWater: 'mountain'` (here and on `scenery` rows): standing on H3 water, the object becomes the
 *  OE water mountains (`mountain_water_big_*` 2x2, `mountain_water_small_*` 1x1), packed over its blocked cells like a land range. */
const OmitRowSchema = z.object({ ...BaseRow, outcome: z.literal('omit'), reason: z.string(), onWater: z.literal('mountain').optional() })

/** Always the same OE sid, regardless of subtype/animation/terrain. */
/** The faction values of a random squad (`propRandomSquads.fraction`) found in the shipped maps: '' (any), 'neutral' or a playable faction. */
export const SQUAD_FRACTIONS = ['', 'neutral', 'human', 'undead', 'dungeon', 'nature', 'unfrozen', 'demon'] as const

const EmitRowSchema = z.object({
  ...BaseRow, outcome: z.literal('emit'), sid: z.string(), kind: ObjectKindSchema, reason: z.string(),
  factionSid: z.string().optional(), freeChoice: z.boolean().optional(),
  /** `random-squad` rows only (the H3 monsters): the squad's faction and tier (1-7; 0 or absent: the game derives the tier from the value). */
  fraction: z.enum(SQUAD_FRACTIONS).optional(),
  /** The faction by the H3 object's subtype, for objects whose subtype is a town (Random Dwelling Faction: 0 Castle ... 10 Factory); a subtype with no entry uses `fraction`. */
  fractionBySubtype: z.record(z.string(), z.enum(SQUAD_FRACTIONS)).optional(),
  tier: z.number().int().min(0).max(7).optional(),
})

/** Decorative scenery — resolved via `role` + the current tile's terrain
 *  biome (`sceneryRoleSids`), feeding the tree/mountain cluster-simulation
 *  path unchanged for those two roles. */
const SceneryRowSchema = z.object({ ...BaseRow, outcome: z.literal('scenery'), role: SceneryRoleSchema, onWater: z.literal('mountain').optional() })

/** Object 199 only: one real H3 scenery family whose exact `.def` animation
 *  determines BOTH the sid and the role (tree-shaped vs rock-shaped) —
 *  the one case role isn't fixed per H3 id, so it needs its own per-entry
 *  role instead of the single-role `scenery` shape above. */
const SceneryDispatchRowSchema = z.object({
  ...BaseRow, outcome: z.literal('scenery-dispatch'),
  exact: z.record(z.string(), z.object({
    sid: z.string(), role: SceneryRoleSchema,
    /** Tree role only: the biomes this sprite's trees come from, named by a tree sid of each (`tree_dirt_1`: Dirt). Every blocked cell draws one of them
     *  at random, whatever terrain the sprite stands on. Absent: the biome of the terrain under each cell. */
    treeBiomes: z.array(z.string()).optional(),
    /** With two `treeBiomes` and a one-cell footprint: the first biome's tree on the cell and the second's on a free tile right beside it (the sprite
     *  is two trees). */
    pair: z.boolean().optional(),
  })),
})

/** A single H3 id whose subtype selects between genuinely different
 *  scenery roles (e.g. id 140: subtype 2 is a tree, subtype 6 is a
 *  mountain) — unlike the plain `scenery` shape's one fixed role. The
 *  matched role is still resolved through the normal role+biome table by
 *  the actual tile it's placed on (unlike `scenery-dispatch`'s fixed
 *  per-entry sid), so it feeds the tree/mountain cluster-simulation path
 *  the same as any other tree/mountain-role object. A subtype with no
 *  entry omits, same reason as an unresolvable plain id. */
const SceneryDispatchSubtypeRowSchema = z.object({
  ...BaseRow, outcome: z.literal('scenery-dispatch-subtype'),
  subtypes: z.record(z.string(), SceneryRoleSchema),
})

/** Everything resolved by subtype and/or `.def` animation (towns, mines,
 *  monoliths, resources, creature generators) — checked in a fixed order:
 *  `freeChoice` (if the subtype is in its list) → `subtypes` → `exact`
 *  (case-insensitive full match) → `tokens` (case-insensitive substring
 *  match) → `default`. Only the fields a given object actually uses are
 *  present; the rest are simply absent, which is why one fixed order can
 *  serve every current case without a per-object override. `unmatchedReason`
 *  is a template with a literal `{value}` placeholder, substituted with the
 *  subtype (when `subtypes` is present) or the raw animation string
 *  (otherwise) when nothing matches and there's no `default`. */
const DispatchRowSchema = z.object({
  ...BaseRow, outcome: z.literal('dispatch'), kind: ObjectKindSchema, reason: z.string(),
  subtypes: z.record(z.string(), z.object({ sid: z.string(), factionSid: z.string().optional() })).optional(),
  exact: z.record(z.string(), z.string()).optional(),
  tokens: z.record(z.string(), z.string()).optional(),
  default: z.string().optional(),
  freeChoice: z.object({ subtypes: z.array(z.number().int()), sid: z.string(), reason: z.string() }).optional(),
  unmatchedReason: z.string().optional(),
})

/** A landmark: one H3 sprite (matched by its `.def`, case-insensitive) that has no OE twin but can be built from one blocking OE object plus an
 *  optional effect on its centre tile (the H3 volcano: a lava mountain with smoke). `smallSid` replaces the blocking object on the tiles that are
 *  already taken when the whole footprint does not fit. A sprite with no entry omits. Placed before any other decoration. */
const LandmarkEntrySchema = z.object({
  /** One blocking OE object on the footprint's centre (the big volcano), ... */
  sid: z.string().optional(),
  effectSid: z.string().optional(),
  smallSid: z.string().optional(),
  /** ... or the footprint covered with OE pieces of these square sizes, each size with the sids that can stand on it (see piece-cover.ts). */
  pieces: z.array(z.object({ size: z.number().int().min(1).max(3), sids: z.array(z.string()).min(1) })).min(1).optional(),
})

const LandmarkRowSchema = z.object({
  ...BaseRow, outcome: z.literal('landmark'),
  exact: z.record(z.string(), LandmarkEntrySchema),
  /** For a sprite with no `exact` entry (every lava lake and flow sprite not listed is a lava pool). */
  default: LandmarkEntrySchema.optional(),
})

/** One choice in a random mix: the OE objects it draws from and how often it is picked. Exactly one of `sids` (these objects), `prefix` (every 1x1 OE
 *  object whose sid starts with it, `palms_`) or `trees` (a tree of the biome of this tree sid, `tree_dirt_1`: a Dirt tree) names the pool. */
export const MixEntrySchema = z.object({
  sids: z.array(z.string()).optional(),
  prefix: z.string().optional(),
  trees: z.string().optional(),
  weight: z.number().min(0),
})

/** A random mix of OE objects over an H3 object's blocked tiles: each tile draws an entry by weight, then an object from its pool, avoiding the models
 *  standing right beside it. For one H3 object to become several OE objects (see `piece-cover.ts` for the size-based kind). */
const MixRowSchema = z.object({ ...BaseRow, outcome: z.literal('mix'), entries: z.array(MixEntrySchema).min(1) })

export const ObjectRowSchema = z.discriminatedUnion('outcome', [
  OmitRowSchema, EmitRowSchema, SceneryRowSchema, SceneryDispatchRowSchema, SceneryDispatchSubtypeRowSchema, DispatchRowSchema, LandmarkRowSchema, MixRowSchema,
])

/** A rule on the sprite's file name (not the object id), checked before the object rows: the first rule whose `pattern` (a case-insensitive regular
 *  expression) matches the sprite turns the object into a random mix. With `accent`, one random tile of the object draws from those entries instead. */
export const SpriteRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  pattern: z.string(),
  entries: z.array(MixEntrySchema).min(1),
  accent: z.array(MixEntrySchema).optional(),
})

/** Numbers the converter's decoration passes use. */
export const H3SettingsSchema = z.object({
  /** Chance that each blocking tile on the bottom edge of a mountain gets a tree, bush or walkable in front of it. */
  mountainFrontChance: z.number().min(0).max(1),
  /** Chance that every open tile gets a random walkable ground cover. */
  walkableFillChance: z.number().min(0).max(1),
  /** Share of the trees on lava ground that stay OE lava trees (the rest are Deathland dead trees). */
  lavaTreeChance: z.number().min(0).max(1),
  /** A start region larger than this many tiles is open land, not a sealed pocket. */
  pocketMaxTiles: z.number().int().min(1).max(500),
})

export const BIOME_NAMES = ['Grass', 'Dirt', 'Autumn', 'Deathland', 'Snow', 'Sand', 'Lava'] as const

/** `into` may use the `type` objects (all objects when there is no type) of `from`, making up `chance` of its picks (see rmg/biome-decoration-mix.ts). */
export const DecorationRuleSchema = z.object({
  into: z.enum(BIOME_NAMES),
  from: z.enum(BIOME_NAMES),
  type: z.string().optional(),
  chance: z.number().min(0).max(1),
})

export const H3ObjectMappingSchema = z.object({
  objects: z.array(ObjectRowSchema),
  spriteRules: z.array(SpriteRuleSchema),
  settings: H3SettingsSchema,
  /** Which biomes borrow trees and mountains from which, for the varied trees and ranges of the import. */
  decorationRules: z.array(DecorationRuleSchema),
  /** H3 object ids that are decoration or terrain overlays whatever their row converts them to: the tool's Scenery group. */
  sceneryGroupIds: z.array(z.number().int()),
  sceneryRoleSids: z.record(z.string(), z.record(z.string(), z.string())),
  /** Real H3 creature-type index (object id 54's `subtype`) -> real
   *  creature name, e.g. `"4": "Griffin"` — only the ids actually sourced
   *  and cross-verified (see h3-object-mapping.ts's own doc comment);
   *  never a full 0-N table with guessed gaps. */
  creatureNames: z.record(z.string(), z.string()).optional(),
  /** Real H3 specific-artifact id (object id 5's `subtype`) -> real
   *  artifact name, same sourcing caveat as `creatureNames`. */
  artifactNames: z.record(z.string(), z.string()).optional(),
  /** Real H3 creature-type index -> nearest-`squadValue` OE creature sid
   *  (see `neutral-strength.ts`'s own `CREATURE_TYPE_SQUAD_VALUE` for the
   *  H3-side value each entry was matched against, and this session's own
   *  notes for the exact matching rule: user-specified OE faction pools
   *  for several id ranges, explicit named pairs for a handful of ids with
   *  no clean nearest-value candidate, full-OE-roster nearest-`squadValue`
   *  otherwise — OE's `unfrozen` faction and every `_alt` upgrade variant
   *  are excluded from every candidate pool). Only ids with a real H3
   *  `squadValue` are present; never a guess for the rest. */
  creatureEquivalents: z.record(z.string(), z.string()).optional(),
  /** Real H3 artifact id -> nearest OE artifact sid, matched by real
   *  equipment slot (hard constraint) then nearest rarity tier (H3's
   *  Treasure/Minor/Major/Relic -> OE's common/rare/epic/legendary) —
   *  see this session's own notes for the exact slot-translation table.
   *  Only ids with a verified real H3 slot+class are present. */
  artifactEquivalents: z.record(z.string(), z.string()).optional(),
})

export type ObjectRow = z.infer<typeof ObjectRowSchema>
export type MixEntry = z.infer<typeof MixEntrySchema>
export type DecorationRuleData = z.infer<typeof DecorationRuleSchema>
export type SpriteRule = z.infer<typeof SpriteRuleSchema>
export type H3Settings = z.infer<typeof H3SettingsSchema>
export type H3ObjectMapping = z.infer<typeof H3ObjectMappingSchema>
export type SceneryRole = z.infer<typeof SceneryRoleSchema>
export type OeBiome = z.infer<typeof OeBiomeSchema>
export type ObjectKind = z.infer<typeof ObjectKindSchema>
