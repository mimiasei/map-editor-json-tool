// ─── H3 random-artifact → OE propRandomItems.rarity ─────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `homm3_olden_rarity_bin.py`, used with the author's explicit permission.
// OE's real `ERarity` domain is 0-3 (Common=0 unused by this policy); H3's
// 0-4 random-artifact classes (any/treasure/minor/major/relic) bin into 1-3.

const H3_RANDOM_ARTIFACT_OBJECT_ID_TO_HOMM_RARITY: Record<number, number> = {
  65: 0, // any
  66: 1, // treasure
  67: 2, // minor
  68: 3, // major
  69: 4, // relic
}

function binHomm3RarityToOldenErarity(hommRarity: number): number {
  if (hommRarity <= 2) return 1
  if (hommRarity === 3) return 2
  return 3
}

/** `null` when `templateObjectId` isn't one of the 5 random-artifact class
 *  ids (65-69) — the caller should fall back to a plain default in that
 *  case (a specific named H3 artifact, object id 5, has no rarity class of
 *  its own; TSE's own confirmed real default for a freshly-placed
 *  `random-item` with no further identity is `rarity: 0`). */
export function rarityForRandomArtifactObjectId(templateObjectId: number): number | null {
  const hommRarity = H3_RANDOM_ARTIFACT_OBJECT_ID_TO_HOMM_RARITY[templateObjectId]
  if (hommRarity === undefined) return null
  return binHomm3RarityToOldenErarity(hommRarity)
}
