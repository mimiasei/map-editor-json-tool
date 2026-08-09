// ─── Custom hero identity (issue #139) ────────────────────────────────────────
// A map-local clone of a real hero definition (Core/DB/heroes/**/*.json),
// shipped under a brand-new heroSid so a placed hero-spawner can get its own
// name/description/motto — the same mechanism a real shipped map already
// uses (Core/DB/heroes/custom_maps/cm_fun_hero_1.json, wired into
// Fun_and_Graves.map via objectsProperties.propHeroes.heroSid), not a guess.
// See plans/testItems-props-reference.md and issue #139 for the investigation.

export interface CustomHeroDefinition {
  /** The new heroSid this clone is shipped under, e.g. "my_map_hero_1" —
   *  what objectsProperties.propHeroes.heroSid gets repointed to. */
  heroSid: string
  /** heroSid this was cloned from (a roster/campaign hero, or another custom
   *  one) — shown as "Based on" in the editor and reused so re-editing an
   *  already-customized hero updates this same clone instead of minting a
   *  new one every save. */
  sourceHeroSid: string
  /** The cloned hero JSON verbatim (mesh, mounts, stats, squads, skills,
   *  magics, etc. — everything from the source definition), with only
   *  name/description/motto repointed to new sids when the user actually
   *  edits that field. A field the user never touches keeps the source
   *  hero's own sid, same as real shipped custom heroes that only bother
   *  renaming what they need to (e.g. cm_fun_hero_1.json keeps Funerella's
   *  original name/description/motto sids unchanged). */
  definition: Record<string, unknown>
}
