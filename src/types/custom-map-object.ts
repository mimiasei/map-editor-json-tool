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
  /**
   * Editor-only display icon (an icon id from any known map object's own
   * derived icon — see `collectMapObjects()`'s `prefs[0]`-stem fallback).
   * Real map objects have no genuine "icon" field in their own JSON at all
   * (confirmed: every Core/DB/map/objects/*.json entry lacks one) — what
   * this app shows is always synthesized from the object's 3D prefab
   * reference, not read from game data. So unlike custom artifacts'
   * `template.icon` (a real field the game reads), this is purely a display
   * preference for this app's own sidebar/pickers and is NEVER written into
   * `template` or shipped — the exported clone stays byte-for-byte
   * consistent with "clone everything except identity" (issue #146's
   * original scope). Absent means "use the base object's own derived icon,"
   * the pre-existing default behavior.
   */
  displayIcon?: string
  /**
   * "Build from scratch" mode only (issue #146 follow-up, prompted by
   * `block`/`block_2` turning out to be a smoke/particle mesh in-game, not
   * static geometry as its `prefs` path name implied): clone native logic
   * from a *different* object than the one supplying the visual
   * (`sourceObjectId`), decoupling "what it looks like" from "what it does."
   * Absent + `noNativeLogic` absent means today's default: logic tied to
   * `sourceObjectId` itself, if it has any (unchanged "clone one object"
   * behavior). Ignored when `noNativeLogic` is true.
   */
  logicSourceObjectId?: string
  /**
   * "Build from scratch" mode's default: ship with zero native logic, even
   * if `sourceObjectId`'s own object has some — the point being that a
   * Script Template's own scripting is the *only* thing that happens when a
   * hero interacts with it. Takes precedence over `logicSourceObjectId`.
   */
  noNativeLogic?: boolean
}
