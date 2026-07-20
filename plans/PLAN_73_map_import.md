# Plan: Issue #73 — Import .map Files & Anchor Editor to Map File

## Background

The editor currently works with standalone JSON files that contain Block 4
scripting data (counters, interruptions, quests). The game produces `.map`
files that embed this same data as Block 4 inside a binary container, and
optionally reads a sidecar `<stem>.json` from the same directory that
overrides Block 4 entirely.

This plan describes making the `.map` file the project anchor: opening it
loads the sidecar JSON (or Block 4 as fallback), extracts map context for
autocomplete, and saving writes back to the sidecar JSON.

---

## .map File Format (reverse-engineered)

### Container

```
[gzip compressed] -> decompressed bytes:
  [1 byte]          hashLen
  [hashLen bytes]   ASCII hex hash string  e.g. "8e4442b580437263cf06682ade2c6a39"
  [1 byte]          verLen
  [verLen bytes]    ASCII version string   e.g. "0.72.30"
  [2 bytes]         0x0D 0x00 — padding/terminator, skip
  [Block 1]         varint length + UTF-8 JSON
  [Block 2]         varint length + UTF-8 JSON
  [Block 3]         varint length + UTF-8 JSON
  [Block 4]         varint length + UTF-8 JSON
```

Varint = standard LEB128 unsigned (protobuf-style).

### Block 1 — Scenario/lobby metadata
Keys: `title`, `desc`, `hashSum`, `nameFromLocalization`, `descFromLocalization`,
`spawns` (playersCount + spawns[]), `startSettings`, `sizeX`, `sizeZ`,
`banInfoData` (bannedHeroes, bannedUnits, bannedMagics, bannedItems, bannedSkills),
`gameMode`, `economicDifficulties`, `aiDifficulties`, `neutralDifficulties`,
`quickStartDifficulties`, `campaignInfo`, `dateTime`, `daysInGame`, `isAutoSave`,
`currentTurnMode`, `gameVersion`, `isScenario`, `template`, `endController`,
`displayWinCondition`

Spawn entry shape:
```json
{ "owner": 1, "spawnType": "...", "factionSid": "nature", "isHeroDefined": true,
  "heroSid": "nature_hero_6", "colorId": -1, "isAlive": true, "isLocked": false }
```

### Block 2 — Map data (terrain + objects)
Keys: `fileMapName`, `mapName`, `mapNameFromLoc`, `mapDesc`, `mapDescFromLoc`,
`sizeX_`, `sizeZ_`, `tilesMap`, `levelsMap`, `climbsMap`, `roadsMap`, `waterMap`,
`objects`, `objectsFreeId`, `squads`, `squadsFreeId`, `markers`, `markersFreeId`,
`areas`, `areasVersion`, `rivers`, `objectsProperties`, `keyObjects`,
`objectValuesOverrides`, `settings`, `banInfoData`, `takenHeroes`,
`haveCustomAreas`, `customAreasPainting`, `generatorChecksum`, `views`,
`cliffRandomSeed`

#### objectsProperties (the important sub-object)
A dict of ~29 named arrays. Relevant ones:

| Key | Relevance |
|-----|-----------|
| `propEntities` | **Primary autocomplete source** — `{type, id, sid}` where `sid` is the entity name used in trigger actions like `DeleteEntity`. Filter out entries with empty `sid`. |
| `propHeroes` | Hero SID assigned to a spawner object — `{type, id, isDefined, heroSid}` |
| `propSpawns` | Player spawn config on hero-spawner objects |
| `propSquads` | Fixed squad composition — `{type, id, unitProps: [{sid, count}], ...}` |
| `propRandomSquads` | Random guard config — `{type, id, sids[], fraction, tier, ...}` |
| `propActionsBefore` | Object-level triggers (before interaction) — `{type, id, repeat, sides, actions[]}` |
| `propActionsAfter` | Object-level triggers (after interaction) — same shape |
| `propVariants` | Visual variant — `{type, id, selectedVar, typeVariant, fraction, unitVersion}` |
| `propActivations` | Active/inactive state — `{type, id, isActive}` |
| `propOwners` | Player ownership assignment |

Object entry in `objects[]`:
```json
{ "sid": "pinetree_1", "ids": [342, 343], "nodes": [965, 966], "rotations": [...], "levels": [...] }
```
Use `ids` array to cross-reference with `objectsProperties` entries.

### Block 3 — Dialogs/quest index
```json
{ "dialogs": { "lines": [] }, "quests": { "quests": [] } }
```
Usually empty. Extract if present.

### Block 4 — Scripting (the editable part)
```json
{ "comment": "", "aiRolesId": null, "counters": [...], "interruptions": [...], "quests": [...] }
```
Same structure as the sidecar JSON but with extra engine fields:
- Counters include `sharing`, `minValue`, `maxValue` (not in sidecar)
- Top level includes `comment`, `aiRolesId` (not in sidecar)

---

## Sidecar JSON relationship

Confirmed from examining all sample maps:

- Naming: `<stem>.json` lives next to `<stem>.map` (same directory)
- The sidecar is a **complete replacement** for Block 4, not a patch
- Sidecar omits engine defaults (`sharing`, `minValue`, `maxValue`, `aiRolesId`)
- Some sidecar files have a **UTF-8 BOM** — parser must handle `utf-8-sig`
- `The_Slaughterfield_(II).map` has no sidecar — maps without custom scripting have no JSON

Load priority: **sidecar JSON wins over Block 4** if both exist.

---

## Data to extract into MapContext

### From Block 1
- `version` (from header)
- `hash` (from header)
- `mapName` (from Block 2 `mapName` — more reliable than Block 1 title key)
- `sizeX`, `sizeZ`
- `players`: `[{owner, factionSid, heroSid, colorId, isLocked}]`
- `bans`: `{heroes[], units[], magics[], items[], skills[]}`

### From Block 2
- `entities`: propEntities filtered to non-empty sid, cross-referenced with objects[] for type + node
- `heroAssignments`: propHeroes entries with isDefined=true
- `takenHeroes`: string[]
- `placedObjectSids`: unique set of all `objects[].sid` values on the map
- `objectIndex`: Map<id, {type, node}> — for resolving entity positions

### From Block 3
- `dialogKeys`: dialog line IDs if present

---

## Files to create/modify

### New files

| File | Purpose |
|------|---------|
| `src/types/map-context.ts` | TypeScript types for MapContext and sub-types |
| `src/lib/map-parser.ts` | Binary parser: DecompressionStream + varint → 4 JSON blocks |
| `src/lib/map-extract.ts` | Extract typed MapContext + ScenarioFile from raw blocks |
| `src/store/useMapContextStore.ts` | Zustand store for read-only map context |
| `src/lib/map-file.ts` | Orchestration: open .map → parse → check sidecar → load both stores |

### Modified files

| File | Change |
|------|--------|
| `src/store/useScenarioStore.ts` | Add `mapFilePath: string \| null` and `sidecarPath: string \| null` to state; update save logic |
| `src/lib/import.ts` | Handle UTF-8 BOM in JSON parsing |
| `src/lib/export.ts` | No change needed |
| `src/lib/native-fs.ts` | Add helpers for reading binary files and writing to specific paths |
| `src/components/layout/Toolbar.tsx` | Add "Open .map" entry; show map file name when loaded |
| `src/components/common/SidCombobox.tsx` | Feed entity SIDs from MapContext as autocomplete source |
| `src/schema/actions.ts` | Tag the `DeleteEntity` / entity-param actions so UI knows to use entity autocomplete |

---

## MapContext types (`src/types/map-context.ts`)

```ts
export interface MapContext {
  filePath: string
  sidecarPath: string        // <stem>.json path
  version: string
  hash: string
  mapName: string
  sizeX: number
  sizeZ: number
  players: PlayerSpawn[]
  bans: BanInfo
  entities: MapEntity[]
  heroAssignments: HeroAssignment[]
  takenHeroes: string[]
  placedObjectSids: string[]
  dialogKeys: string[]
}

export interface PlayerSpawn {
  owner: number
  factionSid: string
  heroSid: string
  colorId: number
  isLocked: boolean
}

export interface MapEntity {
  sid: string           // entity name used in triggers
  objectType: string    // game object type SID
  node: number          // flat tile index (z * sizeX + x)
}

export interface HeroAssignment {
  objectId: number
  heroSid: string
}

export interface BanInfo {
  heroes: string[]
  units: string[]
  magics: string[]
  items: string[]
  skills: string[]
}
```

---

## Parser (`src/lib/map-parser.ts`)

Uses native `DecompressionStream` (no extra dep). Async.

```
parseMapFile(buffer: ArrayBuffer): Promise<RawMapBlocks>
  → gzip decompress
  → read header (hash, version, skip 2 bytes)
  → read 4 varint-length-prefixed UTF-8 JSON blobs
  → return { hash, version, block1, block2, block3, block4 }
```

Varint: standard LEB128, read byte-by-byte, MSB=continue.

---

## Extractor (`src/lib/map-extract.ts`)

```
extractMapContext(raw: RawMapBlocks, filePath: string): MapContext
extractScenario(raw: RawMapBlocks): ScenarioFile
```

`extractScenario` strips the engine-only fields (`sharing`, `minValue`,
`maxValue`, `aiRolesId`, top-level `comment`) so the result matches the
sidecar JSON format the editor already uses.

`extractMapContext` cross-references `propEntities` with `objects[]` to
get the type and node for each entity. Filters out entries with empty `sid`.

---

## Store (`src/store/useMapContextStore.ts`)

```ts
interface MapContextStore {
  context: MapContext | null
  loading: boolean
  error: string | null
  loadFromBlocks(raw: RawMapBlocks, filePath: string): void
  clear(): void
}
```

Not persisted. Not in undo/redo. Reset on new project.

---

## Orchestration (`src/lib/map-file.ts`)

```
openMapFile(file: File | string): Promise<OpenMapResult>
  1. Read binary (File object or Tauri fs path)
  2. parseMapFile(buffer) → raw blocks
  3. Derive sidecarPath = same dir, same stem, .json extension
  4. Check if sidecar exists:
     a. Yes → importScenario(sidecarText) as scenario (existing logic)
     b. No  → extractScenario(raw) as scenario
  5. extractMapContext(raw, filePath) → context
  6. Return { scenario, context, sidecarPath, fromSidecar: bool }
```

Callers load scenario into `useScenarioStore` and context into
`useMapContextStore`.

---

## Save flow changes

When `mapFilePath` is set in the scenario store:
- Save writes to `sidecarPath` (same dir, `<stem>.json`)
- No changes to `.map` file ever
- Save As: user picks new `.json` path (detaches from `.map` — user's choice)

When no `mapFilePath` (standalone JSON workflow):
- Save behavior unchanged

---

## Entity autocomplete integration

`propEntities` entity SIDs (e.g. `"university"`, `"gold_mine"`, `"cirque"`)
appear in trigger action params like `DeleteEntity`, `SpawnObject`, etc.

The `SidCombobox` component is already used for counter/quest SID fields.
Extend it to accept an optional `extraOptions` prop so that when a `.map`
is loaded, entity SIDs from `MapContext.entities` are offered as suggestions.

Alternatively, the `ActionForm` could detect the parameter type from the
action registry and render an `EntityCombobox`-style picker. This is a
follow-up enhancement — for now, surfacing entity SIDs in `SidCombobox`
as suggestions is sufficient.

---

## UX changes

- Toolbar "Open" button accepts both `.json` and `.map`
- When a `.map` is loaded, toolbar shows `<mapName> [.map]` instead of filename
- Map context info panel (optional): show players, entity count, map size
- Save defaults to sidecar path when `.map` is anchored

---

## Out of scope

- Writing back to the `.map` binary (hash algorithm unknown, risky)
- Editing terrain, objects, or Block 2 data
- Full dialog/localization editing from Block 3

---

## Open questions

- `hashSum` in Block 1 — algorithm unknown, not needed for this feature
- `conditionsLogic` enum — only "And" observed; assume "Or" also valid
- `sharing` on counters — only "Clone" observed
- `minValue`/`maxValue` defaults — always int32 bounds in samples; strip on export
