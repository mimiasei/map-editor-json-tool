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
  OmitRowSchema, EmitRowSchema, SceneryRowSchema, SceneryDispatchRowSchema, DispatchRowSchema,
])

export const H3ObjectMappingSchema = z.object({
  objects: z.array(ObjectRowSchema),
  sceneryRoleSids: z.record(z.string(), z.record(z.string(), z.string())),
})

export type ObjectRow = z.infer<typeof ObjectRowSchema>
export type H3ObjectMapping = z.infer<typeof H3ObjectMappingSchema>
export type SceneryRole = z.infer<typeof SceneryRoleSchema>
export type OeBiome = z.infer<typeof OeBiomeSchema>
export type ObjectKind = z.infer<typeof ObjectKindSchema>
