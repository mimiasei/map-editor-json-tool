// ─── H3 object → OE mapping — single source of truth ─────────────────────────
// Replaces the previous object-map.ts, which spread this same decision
// ("what does H3 object X become on the OE side") across ~10 separate
// hand-built TS tables. Real user ask (issue #207 follow-up): a single,
// human-editable file naming both the H3 object (e.g. "Reef") and its OE
// sid, that IS the actual resolution data rather than a description of it —
// so a mapping can be corrected by editing h3-object-mapping.json directly,
// no resolver code changes needed.
//
// `h3-object-mapping.json`'s `objects[]` covers every classic H3 object-class
// id this codebase parses (0-231): `h3Name` is VCMI's own name for that id
// (vcmi/vcmi's config/objects/*.json, each entry's own "index" field,
// verified 2026-08-29), Title-Cased for readability — or "Unidentified" for
// the ~60 ids with no entry anywhere in VCMI's public registry at all
// (confirmed by direct inspection, not an extraction miss — e.g. ids
// 138-142 are provably absent from generic.json's own index sequence,
// `...137 pineTrees, 143 riverDelta...` with nothing between; most plausibly
// HotA-exclusive decorative content VCMI can't redistribute).
//
// The initial JSON was generated, not hand-typed, from this file's own
// predecessor (object-map.ts) plus that VCMI name research, to avoid the
// exact transcription-error risk this codebase has been burned by before
// (OBJECT_199_ANIMATION_TO_SID's first hand-transcription "silently
// invented nonexistent entries and dropped real ones"). The one deliberate
// content change from that mechanical transcription: id 161 (Reef, a
// static/non-interactive water-adjacent blocker per VCMI's own
// `"handler": "static"`) now resolves to the `rock` scenery role instead of
// being omitted — closest existing match to the other solid-decoration
// roles (`rock`/`skull`/`stump`), a judgment call, easy to revise by editing
// its one row.
//
// Second source, for ids VCMI's own registry has no entry for at all: GK's
// `EdObjts.txt` (github.com/Shakajiub/HoMM3-maps, HotA-maintained) lists
// every stock `.def` filename with its object id/subtype and a `// biome -
// visual category` comment (e.g. "DIRT - TREES"). This resolved a handful
// of ids VCMI has nothing for, and — for id 140 specifically — showed it's
// a genuine multi-role class where SUBTYPE picks the visual role (rock vs.
// tree vs. mountain vs. lake), cross-checked against real per-subtype
// instance counts in `maps/H3_Maps/` before deciding which subtypes were
// confident enough to map (`scenery-dispatch-subtype` below) versus left
// omitted (subtypes 9/10 have real volume but an uncertain footprint/role;
// 11/13 aren't in EdObjts.txt's own id-140 listing at all — real, disclosed
// gaps, not guesses).

import { H3ObjectMappingSchema, type ObjectRow, type SceneryRole, type OeBiome, type ObjectKind } from './h3-object-mapping-schema'
import mappingData from './h3-object-mapping.json'

export type { SceneryRole, OeBiome, ObjectKind }

/** H3 terrain id → the biome bucket key `sceneryRoleSids` uses (real H3
 *  terrain name in the comment above each entry, same numbering
 *  `terrain-map.ts`'s own `H3_TO_STOCK_TILE` table uses). Distinct from
 *  that table — this one is purely about which scenery-variant bucket to
 *  pick from. Terrain-id data, not object-mapping data, so it stays a
 *  plain constant rather than living in the editable JSON (paralleling
 *  `terrain-map.ts`'s own terrain table).
 *
 *  10/11 (both HotA-only) mirror `H3_TO_STOCK_TILE`'s own treatment of
 *  them (highlands → grass-like tile, wasteland → Deathland-like tile),
 *  for the same reason: real HotA maps place plenty of scenery on both
 *  (confirmed against the `maps/H3_Maps/` corpus — 25 maps carry
 *  highlands tiles, 17 carry wasteland), so leaving them unmapped and
 *  falling through to the generic `?? 'grass'` default silently biased
 *  every wasteland-tile scenery pick toward grass-family sids instead of
 *  the Deathland-appropriate ones. */
export const H3_TERRAIN_BIOME: Record<number, OeBiome> = {
    // H3: Dirt
    0: 'dirt',
    // H3: Sand
    1: 'sand',
    // H3: Grass
    2: 'grass',
    // H3: Snow
    3: 'snow',
    // H3: Swamp
    4: 'dead',
    // H3: Rough
    5: 'dirt',
    // H3: Subterranean
    6: 'dirt',
    // H3: Lava
    7: 'lava',
    // H3: Water
    8: 'water',
    // H3: Rock
    9: 'dirt',
    // H3: Highlands (HotA)
    10: 'grass',
    // H3: Wasteland (HotA)
    11: 'dead',
}

/** H3's "Oak Trees" object — real name confirmed via VCMI's own community-
 *  maintained `config/biomes.json`, which names this exact animation-prefix
 *  pair `greenOakTrees` (`AVLSPTR*`) and `autumnOakTrees` (`avlautr*`/
 *  `AVLAUTR*`), both filed under object class 135. Given its own broadleaf
 *  look (distinct from 137's "Pine Trees"), resolved with a genuine mix of
 *  OE's grass and dirt tree families rather than the single per-biome sid
 *  every other tree object gets — see `scenery-clusters.ts`'s
 *  `buildOakTreePool()`. Structural — stays a constant, not table data. */
export const H3_OAK_TREES_OBJECT_ID = 135

const mapping = H3ObjectMappingSchema.parse(mappingData)
const objectsById = new Map<number, ObjectRow>(mapping.objects.map((row) => [row.h3Id, row]))

export const BIOME_ROLE_REPLACEMENTS: Record<SceneryRole, Record<OeBiome, string>> = mapping.sceneryRoleSids as Record<SceneryRole, Record<OeBiome, string>>

/** `"<Name> (id N)"`, or `"H3 object id N (unidentified)"` when this id has
 *  no entry in VCMI's own registry — used by the import report so a raw
 *  numeric id is never the only thing the user sees. */
export function describeH3ObjectId(id: number): string {
  const row = objectsById.get(id)
  if (!row || row.h3Name === 'Unidentified') return `H3 object id ${id} (unidentified)`
  return `${row.h3Name} (id ${id})`
}

/** Just the name portion of {@link describeH3ObjectId}, with no "(id N)"
 *  suffix — for callers (the detailed import report) that already carry the
 *  numeric id as its own field and don't want it duplicated inline. */
export function h3DisplayName(id: number): string {
  const row = objectsById.get(id)
  return !row || row.h3Name === 'Unidentified' ? 'Unidentified' : row.h3Name
}

const creatureEquivalents: Record<string, string> = mapping.creatureEquivalents ?? {}
const artifactEquivalents: Record<string, string> = mapping.artifactEquivalents ?? {}

/** Nearest-`squadValue` real OE creature sid for object id 54's `subtype`
 *  (this session's own `creatureEquivalents` table — see its own doc
 *  comment in h3-object-mapping-schema.ts for the exact matching rule).
 *  `null` for a subtype with no known H3 squad value (HotA-only ids this
 *  session couldn't source) — never a guess. */
export function h3CreatureEquivalent(subtype: number): string | null {
  return creatureEquivalents[String(subtype)] ?? null
}

/** Nearest real OE artifact sid (by slot then rarity) for object id 5's
 *  `subtype` — same fallback contract as `h3CreatureEquivalent`. */
export function h3ArtifactEquivalent(subtype: number): string | null {
  return artifactEquivalents[String(subtype)] ?? null
}

/** This H3 id's `ObjectKind` category, straight from the mapping table's
 *  own data — `null` when genuinely unknown (no row at all, e.g. an id
 *  with no mapping table entry; or an `omit` row, which carries no `kind`
 *  field in the schema at all — see `h3-object-mapping-schema.ts`'s
 *  `OmitRowSchema`). Never guessed: an `omit` row's real family (is a
 *  deferred witch hut an interactable? a resource?) simply isn't captured
 *  anywhere in this table today, so returning a category for it would be
 *  fabricated, not derived. */
const creatureNames: Record<string, string> = mapping.creatureNames ?? {}
const artifactNames: Record<string, string> = mapping.artifactNames ?? {}

/** Real H3 creature name for object id 54's `subtype` — e.g. `4` -> "Griffin"
 *  — sourced from VCMI's own creature config (HotA ids cross-checked
 *  against a second independent source), never a guessed fallback. `null`
 *  for a subtype this table hasn't been filled in for (currently HotA's
 *  Factory-town creatures, ids 172+ — no reliable id/name pairing was
 *  found for those; see this session's own sourcing notes). Callers should
 *  fall back to the generic `h3DisplayName(54)` ("Monster") in that case. */
export function h3CreatureName(subtype: number): string | null {
  return creatureNames[String(subtype)] ?? null
}

/** Real H3 artifact name for object id 5's `subtype` — same sourcing/
 *  fallback contract as `h3CreatureName`. */
export function h3ArtifactName(subtype: number): string | null {
  return artifactNames[String(subtype)] ?? null
}

export function h3ObjectCategory(id: number): string | null {
  const row = objectsById.get(id)
  if (!row) return null
  switch (row.outcome) {
    case 'emit':
    case 'dispatch':
      return row.kind
    case 'scenery':
    case 'scenery-dispatch':
    case 'scenery-dispatch-subtype':
      return 'scenery'
    case 'omit':
      return null
  }
}

function animationTokenMatch(animation: string, table: Record<string, string>): string | null {
  for (const [token, sid] of Object.entries(table)) {
    if (animation.includes(token)) return sid
  }
  return null
}

export type ObjectResolution =
  | { action: 'omit'; reason: string }
  | { action: 'emit'; sid: string; kind: ObjectKind; reason: string; factionSid?: string; freeChoice?: boolean; role?: SceneryRole }

/** Resolve any H3 object to a stock OE sid — table-driven, reading
 *  `h3-object-mapping.json`'s row for `templateObjectId` and dispatching on
 *  its own `outcome`. `kind` is always an explicit field on the matching
 *  row, never re-derived from the resolved sid's own string shape — CLAUDE.md's
 *  hard-won lesson (a `sid.startsWith('portal')`/`random-item` special case
 *  used to exist specifically because `kind` wasn't reliably trackable
 *  before; baking it into the data removes that whole class of bug). */
export function resolveObjectSid(
  templateObjectId: number, templateAnimation: string, templateSubtype: number, h3TerrainAtTile: number,
): ObjectResolution {
  const oid = templateObjectId
  const anim = (templateAnimation || '').toLowerCase()
  const subtype = templateSubtype || 0

  const row = objectsById.get(oid)
  if (!row) return { action: 'omit', reason: `unmapped_template_object_id_${oid}` }

  switch (row.outcome) {
    case 'omit':
      return { action: 'omit', reason: row.reason }

    case 'emit':
      return { action: 'emit', sid: row.sid, kind: row.kind, reason: row.reason, factionSid: row.factionSid, freeChoice: row.freeChoice }

    case 'scenery': {
      const biome = H3_TERRAIN_BIOME[h3TerrainAtTile] ?? 'grass'
      const sid = BIOME_ROLE_REPLACEMENTS[row.role][biome]
      return { action: 'emit', sid, kind: 'scenery', role: row.role, reason: 'scenery_role_or_animation' }
    }

    case 'scenery-dispatch': {
      const hit = row.exact[anim]
      if (!hit) return { action: 'omit', reason: `unmapped_template_object_id_${oid}` }
      return { action: 'emit', sid: hit.sid, kind: 'scenery', role: hit.role, reason: 'scenery_role_or_animation' }
    }

    case 'scenery-dispatch-subtype': {
      const role = row.subtypes[String(subtype)]
      if (!role) return { action: 'omit', reason: `unmapped_template_object_id_${oid}_subtype_${subtype}` }
      const biome = H3_TERRAIN_BIOME[h3TerrainAtTile] ?? 'grass'
      const sid = BIOME_ROLE_REPLACEMENTS[role][biome]
      return { action: 'emit', sid, kind: 'scenery', role, reason: 'scenery_role_or_animation' }
    }

    case 'dispatch': {
      if (row.freeChoice && row.freeChoice.subtypes.includes(subtype)) {
        return { action: 'emit', sid: row.freeChoice.sid, kind: row.kind, factionSid: '', freeChoice: true, reason: row.freeChoice.reason }
      }
      const bySubtype = row.subtypes?.[String(subtype)]
      if (bySubtype) return { action: 'emit', sid: bySubtype.sid, kind: row.kind, factionSid: bySubtype.factionSid, reason: row.reason }
      const byExact = row.exact?.[anim]
      if (byExact) return { action: 'emit', sid: byExact, kind: row.kind, reason: row.reason }
      const byToken = row.tokens && animationTokenMatch(anim, row.tokens)
      if (byToken) return { action: 'emit', sid: byToken, kind: row.kind, reason: row.reason }
      if (row.default) return { action: 'emit', sid: row.default, kind: row.kind, reason: row.reason }
      const template = row.unmatchedReason ?? `unmapped_template_object_id_${oid}`
      const value = row.subtypes ? String(subtype) : templateAnimation
      return { action: 'omit', reason: template.replace('{value}', value) }
    }
  }
}
