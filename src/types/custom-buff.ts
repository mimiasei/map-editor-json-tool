// ─── Custom buff identity (issue #165) ─────────────────────────────────────────
// A map-local clone of a real buff/status-effect definition
// (Core/DB/buffs/*.json — a flat, multi-entry-per-file array, same shape
// family as artifacts) shipped under a brand-new buff id so it gets its own
// name/description/icon/stats — the same "clone a real definition, mint a
// new id, ship it" pattern used for custom heroes/units/map objects/
// artifacts. Unlike those, a buff has no map/script identity of its own to
// grant directly — it only becomes reachable once referenced by id from
// somewhere else (an artifact's battleSubskillBonus, an objects_logic
// reward, a future custom skill/spell), which is why every EntityCombobox
// buff picker must show custom buffs alongside real ones.

export interface CustomBuffDefinition {
  /** The new buff id this clone is shipped under — also the sid any
   *  buff-referencing field (an artifact bonus, a reward parameter) would
   *  point to. */
  id: string
  /** Buff id this was cloned from (a real catalog buff, or another custom
   *  one) — shown as "Based on" in the editor and reused so re-editing an
   *  already-customized buff updates this same clone instead of minting a
   *  new one every save. Empty when built from scratch. */
  sourceBuffId: string
  /** The cloned DB/buffs/*.json entry verbatim, with only
   *  id/name_/description_/icon repointed to new sids/values when the user
   *  actually edits that field, plus whatever `data`/top-level fields the
   *  editor's typed forms touch. Fields with no typed form (actions,
   *  mechanics, disablers, immunities, sequenceEffect, statOverrides,
   *  vfxList, timeoutActions, mimicStats, activationParams, and a handful of
   *  rarer flags) are preserved verbatim from the clone source and remain
   *  editable via the dialog's raw JSON fallback. */
  template: Record<string, unknown>
}
