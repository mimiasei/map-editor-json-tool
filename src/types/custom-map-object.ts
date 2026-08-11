// ─── Custom map object identity (issue #146) ──────────────────────────────────
// A map-local clone of a real object template (Core/DB/map/objects/*.json) plus
// its matching behavior logic (Core/DB/objects_logic/**/*.json), shipped under
// a brand-new object id so it gets its own name/description/narrativeDescription
// — the mechanism the user discovered and verified in-game (a new object type
// shows up in the official Unfrozen map editor and works when placed), the same
// "clone a real definition, mint a new id, ship it" pattern issue #139/#141
// already use for heroes. See plans/PLAN-issue-145-object-naming-feasibility.md
// and issue #146 for the investigation and confirmed constraints.

export interface CustomMapObjectDefinition {
  /** The new object id this clone is shipped under — also the shipped
   *  filename basis and the sid a placed objects[] entry would reference. */
  id: string
  /** Object id this was cloned from (a real catalog object, or another
   *  custom one) — shown as "Based on" in the editor and reused so
   *  re-editing an already-customized object updates this same clone
   *  instead of minting a new one every save. */
  sourceObjectId: string
  /** The cloned DB/map/objects entry verbatim, with only
   *  id/name/description/narrativeDescription repointed to new sids when the
   *  user actually edits that field. Everything else (tag, isInteractable,
   *  prefs, geometry, generatorConfig, …) keeps the source object's own
   *  values unchanged. */
  template: Record<string, unknown>
  /** The cloned DB/objects_logic entry verbatim, with only `id` repointed —
   *  absent when the source object has no matching logic entry (pure
   *  decorations/environment objects may not). */
  logic?: Record<string, unknown>
  /** The source logic's own family subfolder (e.g. "event_banks") — required
   *  to ship the clone back to a working destination. Confirmed by live
   *  in-game testing that the clone must land in the *exact* subfolder its
   *  source lives in; a shared/generic subfolder breaks the object. Absent
   *  iff `logic` is absent. */
  logicSourcePath?: string
}
