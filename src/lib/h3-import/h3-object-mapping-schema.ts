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
 *  import report's "Not converted" list). */
const OmitRowSchema = z.object({ ...BaseRow, outcome: z.literal('omit'), reason: z.string() })

/** Always the same OE sid, regardless of subtype/animation/terrain. */
const EmitRowSchema = z.object({
  ...BaseRow, outcome: z.literal('emit'), sid: z.string(), kind: ObjectKindSchema, reason: z.string(),
  factionSid: z.string().optional(), freeChoice: z.boolean().optional(),
})

/** Decorative scenery — resolved via `role` + the current tile's terrain
 *  biome (`sceneryRoleSids`), feeding the tree/mountain cluster-simulation
 *  path unchanged for those two roles. */
const SceneryRowSchema = z.object({ ...BaseRow, outcome: z.literal('scenery'), role: SceneryRoleSchema })

/** Object 199 only: one real H3 scenery family whose exact `.def` animation
 *  determines BOTH the sid and the role (tree-shaped vs rock-shaped) —
 *  the one case role isn't fixed per H3 id, so it needs its own per-entry
 *  role instead of the single-role `scenery` shape above. */
const SceneryDispatchRowSchema = z.object({
  ...BaseRow, outcome: z.literal('scenery-dispatch'),
  exact: z.record(z.string(), z.object({ sid: z.string(), role: SceneryRoleSchema })),
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

export const ObjectRowSchema = z.discriminatedUnion('outcome', [
  OmitRowSchema, EmitRowSchema, SceneryRowSchema, SceneryDispatchRowSchema, SceneryDispatchSubtypeRowSchema, DispatchRowSchema,
])

export const H3ObjectMappingSchema = z.object({
  objects: z.array(ObjectRowSchema),
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
export type H3ObjectMapping = z.infer<typeof H3ObjectMappingSchema>
export type SceneryRole = z.infer<typeof SceneryRoleSchema>
export type OeBiome = z.infer<typeof OeBiomeSchema>
export type ObjectKind = z.infer<typeof ObjectKindSchema>
