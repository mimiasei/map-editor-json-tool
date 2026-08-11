// ─── The 7 basic (tradeable) resource ids ────────────────────────────────────
// Confirmed against Core/DB/res/resources_info.json, which lists these plus a
// handful of special/non-tradeable resources (dust, graal, starDust, hero_mana,
// hero_move_points, ...) not relevant to economy amounts a map author sets by
// hand — dust IS one of the 7 here (it behaves as a normal tradeable resource
// in this game, unlike the others). Previously hardcoded twice in
// src/schema/conditions.ts; issue #143's reward-slot editor needs the same
// list, so it's a shared constant instead of a third copy.
export const BASIC_RESOURCE_IDS = ['gold', 'dust', 'wood', 'ore', 'crystals', 'mercury', 'gemstones']
