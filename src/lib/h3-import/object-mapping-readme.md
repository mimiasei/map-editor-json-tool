# How to map an "omit" row to a real OE object

## 1. Find the row

Each entry in `objects[]` is keyed by `h3Id` (the H3 object-class number). An unmapped one looks like:

```json
{ "h3Id": 95, "h3Name": "Tavern", "outcome": "omit", "reason": "unmapped_template_object_id_95" }
```

## 2. Change it to the simplest shape, `emit`

`emit` always resolves to the same OE object, regardless of subtype/animation/terrain:

```json
{ "h3Id": 95, "h3Name": "Tavern", "outcome": "emit", "sid": "tavern", "kind": "interactable", "reason": "direct_template_sid" }
```

Fields that matter:

- **`sid`** — the OE catalog id. This is the one thing Zod can't validate for you (see step 3).
- **`kind`** — one of `town`, `portal`, `resource`, `mine`, `dwelling`, `artifact`, `random_squad`, `interactable`, `map_event`, `scenery`. This drives report categorization and a couple of downstream branches in `convert-h3m-to-map.ts` (e.g. `town`/`portal` get special treatment). For a normal building like this, `interactable` is right — it's what every other plain building (chest, fountain, watchtower, ...) already uses.
- **`reason`** — purely cosmetic/diagnostic, only shown for *omitted* objects in the report. For an `emit` row it's never displayed anywhere; `"direct_template_sid"` is the convention (matches every other simple 1:1 row) but the string itself is inert.
- **`h3Name`** stays as-is — it's just the display label, unrelated to resolution.
- **`factionSid`/`freeChoice`** are optional extras only `town`-kind rows use — leave them out here.

## 3. The part Zod can't check for you: does the sid actually exist?

The schema validates *shape* (right fields, right types) but has no knowledge of OE's real catalog — a typo'd sid will load fine and only fail later (the object either won't render or falls back to a generic 1×1 blocker).

Before using a sid, confirm it's real. For `tavern`, `Core/DB/map/objects/4_interactables.json` has:

```json
{ "id": "tavern", "isInteractable": true, "sizeX": 3, "sizeZ": 3, "..." : "..." }
```

— a real, placeable 3×3 building. You don't need to specify anything about its size/footprint in this file — that's resolved automatically from the catalog at placement time.

The easiest way to check a sid yourself:
- search for it in TSE's own object browser (once Core.zip is loaded), or
- grep `Core/DB/map/objects/*.json` for `"id": "<sid>"`.

## 4. Test it for real

JSON validation alone doesn't prove the mapping is *correct* — import an `.h3m` map that actually contains that object and check the result:

- either through TSE's own Import H3M dialog (the report will show it under "Source objects" and it'll no longer appear in "Not converted"),
- or find a real sample map with that object, convert it, and confirm the expected sid landed in the output (e.g. `All for One.h3m` has a Tavern instance — confirmed one `tavern` object in the converted result).

## Other outcome shapes

`scenery`, `dispatch`, `scenery-dispatch`, and `scenery-dispatch-subtype` exist for objects that resolve differently depending on subtype/animation/terrain (see the doc comments in `h3-object-mapping-schema.ts`) — but for a plain "this H3 object is always this one OE object," `emit` is all you need, same shape as Tavern above.
