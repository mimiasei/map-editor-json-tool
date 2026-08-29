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

import { H3ObjectMappingSchema, type ObjectRow, type SceneryRole, type OeBiome, type ObjectKind } from './h3-object-mapping-schema'
import mappingData from './h3-object-mapping.json'

export type { SceneryRole, OeBiome, ObjectKind }

/** H3 terrain id → the biome bucket key `sceneryRoleSids` uses. Distinct
 *  from `terrain-map.ts`'s H3-terrain→OE-tile-id table — this one is purely
 *  about which scenery-variant bucket to pick from. Terrain-id data, not
 *  object-mapping data, so it stays a plain constant rather than living in
 *  the editable JSON (paralleling `terrain-map.ts`'s own terrain table). */
export const H3_TERRAIN_BIOME: Record<number, OeBiome> = {
  0: 'dirt', 1: 'sand', 2: 'grass', 3: 'snow', 4: 'dead', 5: 'grass', 6: 'dirt', 7: 'lava', 8: 'water', 9: 'dirt',
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
