// ─── Custom artifact identity (issue #150) ────────────────────────────────────
// A map-local clone of a real item/artifact definition
// (Core/DB/items/items/*.json — a flat, multi-entry-per-file array, unlike
// units' one-file-per-unit or map objects' object+logic split), shipped under
// a brand-new artifact id so it gets its own name/description/
// narrativeDescription AND icon — the same "clone a real definition, mint a
// new id, ship it" pattern used for custom heroes/units/map objects, extended
// here with icon editing since (unlike units, which have no icon field at
// all) every real artifact already carries a real icon id.

export interface CustomArtifactDefinition {
  /** The new artifact id this clone is shipped under — also the sid a
   *  GiveItemHero/etc. script action, or a placed objects[] entry (if ground
   *  placement is shipped too), would reference. */
  id: string
  /** Artifact id this was cloned from (a real catalog artifact, or another
   *  custom one) — shown as "Based on" in the editor and reused so
   *  re-editing an already-customized artifact updates this same clone
   *  instead of minting a new one every save. */
  sourceArtifactId: string
  /** The cloned DB/items/items entry verbatim, with only
   *  id/name/description/narrativeDescription/icon repointed to new
   *  sids/values when the user actually edits that field. Everything else
   *  (slot_, rarity, bonuses, goodsValue, …) keeps the source item's own
   *  values unchanged — editing mechanical effects is out of scope (issue
   *  #150 plan): the `bonuses` shape varies too wildly across items for a
   *  generic editor, and no one has asked for it. */
  template: Record<string, unknown>
  /** The cloned DB/map/objects/6_artifacts.json entry verbatim (id/icon
   *  repointed, the source's own 3D prefab/geometry kept unchanged), so the
   *  clone becomes placeable in the official Unfrozen map editor the same
   *  way custom map objects are. Absent when the source artifact has no
   *  matching ground-placement entry (e.g. magic scroll items, which are
   *  only ever obtained via a scroll-box reward roll, never placed loose). */
  mapObjectTemplate?: Record<string, unknown>
}
