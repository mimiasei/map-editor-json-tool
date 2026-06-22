# Issue #27 — Dialog flow editor + localization + map ZIP export

## Background

A distributable custom map for HoMM Olden Era requires three files packed
into a companion ZIP placed next to `Core.zip` in `StreamingAssets/`:

```
your_map.zip/
├── DB/dialogs/dialogs/custom_maps/{Map Name}/
│   ├── {dialog_id}.json    ← one per Dialog action key
│   └── ...
└── Lang/
    └── english/texts/customMaps.json
```

The engine merges this ZIP with Core.zip at runtime (confirmed by Papyjama/Unfrozen).
Core.zip is never modified — it is overwritten on every game update.

---

## Dialog flow JSON format (confirmed from Core.zip)

```json
{
  "array": [{
    "id": "my_map_intro",
    "localization": true,
    "slides": [
      {
        "id": "start",
        "fon": "",
        "avatars": [{"position": 1, "icon": "icons/dialogue/...", "isForeground": "true", "animations": ["zoomIn"]}],
        "title": {"sid": "dialogue_title_hero_dungeon", "position": 3},
        "mapActions": [],
        "text": "my_map_intro_text_1",
        "next": "1"
      },
      {
        "id": "1",
        "text": "my_map_intro_text_2",
        "answers": [
          {
            "text": "my_map_intro_text_2_answer_1",
            "actions": [{"a": "Go", "p": ["2"]}],
            "mapActions": []
          }
        ]
      },
      {"id": "2", "text": "my_map_intro_text_3", "end": true}
    ]
  }]
}
```

Key facts:
- `id` on the array item matches the `Dialog` action key in the scenario script
- Each slide has `text` (a localization SID), `title.sid` (speaker), `avatars`
- Flow: `next` (auto-advance), `answers` (player choice), `end: true` (terminal)
- `mapActions` per slide fire during that slide (camera, counters, etc.)
- `invokeOnlyActions: true` + `end: true` = silent action slide (no UI shown)

## Localization format (confirmed from Core.zip)

```json
{"tokens": [
  {"sid": "my_map_intro_text_1", "text": "Welcome, hero!"},
  {"sid": "my_map_quest_name",   "text": "The Lost Kingdom"}
]}
```

File is UTF-8 with BOM. One `customMaps.json` per language folder.

---

## Working / project format

The editor stores dialog + localization data as reserved top-level keys in the
scenario JSON. These keys are prefixed with `_` to signal they are editor-only
and are **stripped on export for game**.

```json
{
  "counters": [...],
  "interruptions": [...],
  "quests": [...],
  "_mapName": "My Custom Map",
  "_dialogs": {
    "my_map_intro": { ...DialogFlow... }
  },
  "_localization": {
    "my_map_intro_text_1": "Welcome, hero!",
    "my_map_quest_name": "The Lost Kingdom"
  }
}
```

Import is fully backward-compatible: raw scenario JSONs (no `_*` keys) load fine,
editor-enriched JSONs round-trip correctly.

---

## Data types  (`src/types/dialog.ts`)

```ts
export interface DialogAvatar {
  position: number               // 1-5
  icon: string                   // e.g. "icons/dialogue/dialog_hero_nature_3_Gingertail_large"
  isForeground: 'true' | 'false'
  animations?: string[]          // e.g. ["zoomIn"]
}

export interface DialogAnswer {
  text: string                   // localization SID
  actions: Array<{a: string; p?: string[]}>     // dialog flow actions (Go, End)
  mapActions?: Array<{a: string; p?: string[]}>  // map actions (RemoveRes, etc.)
  requests?: Array<{c: string; p?: string[]}>   // conditions for answer availability
}

export interface DialogSlide {
  id: string
  fon?: string
  avatars?: DialogAvatar[]
  title?: {sid: string; position?: number}
  text?: string                  // localization SID (empty = action-only slide)
  mapActions?: Array<{a: string; p?: string[]}>
  showAnimationsImmediately?: boolean
  invokeOnlyActions?: boolean
  next?: string                  // id of next slide
  end?: boolean
  answers?: DialogAnswer[]
}

export interface DialogFlow {
  id: string
  localization: true
  slides: DialogSlide[]
}
```

---

## Store additions  (`src/store/useScenarioStore.ts`)

New top-level state:
```ts
mapName: string                            // default: ''
dialogs: Record<string, DialogFlow>        // keyed by dialog ID
localization: Record<string, string>       // SID → text (English)
```

New operations:
```ts
setMapName(name: string): void
setDialogFlow(id: string, flow: DialogFlow): void
removeDialogFlow(id: string): void
setLocalizationToken(sid: string, text: string): void
removeLocalizationToken(sid: string): void
setLocalizationBatch(tokens: Record<string, string>): void
```

`resetScenario` also clears `mapName`, `dialogs`, `localization`.
`setScenario` accepts enriched project JSON and extracts `_*` fields.

---

## Import / export changes  (`src/lib/import.ts`, `src/lib/export.ts`)

### import.ts
- After parsing, extract and strip `_mapName`, `_dialogs`, `_localization`
- Call `store.setMapName / store.setDialogFlow / store.setLocalizationBatch` with extracted data
- The remaining object is the raw scenario and goes through existing parse path

### export.ts  (scenario JSON)
- `exportScenario` already produces the raw scenario — no change needed
- New `exportProjectJson`: produces the full editor JSON (scenario + `_*` keys) for saving as `.json`

### zip-export.ts  (new file `src/lib/zip-export.ts`)
- Collects all `DialogFlow` objects from store
- Collects all localization tokens from store
- Auto-generates missing text tokens from dialog slide text SIDs
- Builds ZIP using `jszip`:
  - `DB/dialogs/dialogs/custom_maps/{mapName}/{id}.json` per dialog
  - `Lang/english/texts/customMaps.json`
- Returns `Blob` (browser download) or writes to path (Tauri native save)

---

## UI components

### 1. `MapMetaForm`  (inline in editor panel when nothing selected)
- "Map Name" text field — sets `mapName` in store
- "SID Prefix" (read-only suggestion, derived from mapName: lowercase + underscores)
- Shows in the editor panel when no node is selected (currently shows empty state)

### 2. `DialogsPanel`  (new sidebar section, below the tree)
- Lists all dialog flows in the store
- Each row: dialog ID, slide count, missing-text badge
- Buttons: Add dialog, Edit, Delete
- "Edit" opens `DialogEditor` modal

### 3. `DialogEditor` modal  (`src/components/dialogs/DialogEditor.tsx`)
- Header: dialog ID (editable), localization toggle
- Slide list (reorderable):
  - Slide ID, text SID (with inline text preview if token exists), next/end
  - Speaker title SID + position
  - Avatar list (position, icon, isForeground, animations)
  - mapActions (reuses existing ActionList component)
  - Answers section (player choices: text SID, dialog actions, mapActions)
- Add slide button
- Delete slide button
- Auto-names slide IDs (start, 1, 2, 3...)
- Auto-names text SIDs from dialog ID + `_text_N`

### 4. `LocalizationDialog` modal  (`src/components/dialogs/LocalizationDialog.tsx`)
- Opened from toolbar button "Localization"
- Tabs: Dialogs | Quest names | All tokens
- Each row: SID key (read-only), text textarea
- Missing tokens highlighted in amber
- Search/filter
- Import from existing `customMaps.json` (paste or file)

### 5. Toolbar additions
- "Localization" button → opens `LocalizationDialog`
- "Export ZIP" button → calls `exportMapZip` from `zip-export.ts`

### 6. Action form integration
- When a `Dialog` or `RandomDialog` action is shown in `ActionForm`, render a
  small "Edit dialog →" button next to the key field that opens `DialogEditor`
  for that key (creates a new flow if none exists)

---

## Validation additions  (`src/lib/validate.ts`)

New warnings:
- `Dialog` action key has no corresponding dialog flow in `_dialogs`
- Dialog flow slide `text` SID has no localization token
- Quest/subquest `name` field is a loc key with no localization token
- `mapName` is empty when dialogs exist (needed for ZIP folder)

---

## Export ZIP structure  (example)

Map name: `"My Custom Map"`, dialog key: `my_map_intro`

```
my_custom_map.zip
├── DB/
│   └── dialogs/
│       └── dialogs/
│           └── custom_maps/
│               └── My Custom Map/
│                   └── my_map_intro.json
└── Lang/
    └── english/
        └── texts/
            └── customMaps.json
```

---

## Implementation order

1. `src/types/dialog.ts` — new types
2. `src/store/useScenarioStore.ts` — add mapName/dialogs/localization state + ops
3. `src/lib/import.ts` — extract `_*` keys on load
4. `src/lib/export.ts` — add `exportProjectJson`
5. `npm install jszip @types/jszip`
6. `src/lib/zip-export.ts` — ZIP assembly
7. `src/components/layout/MapMetaForm.tsx`
8. `src/components/dialogs/DialogEditor.tsx`
9. `src/components/dialogs/LocalizationDialog.tsx`
10. Wire toolbar buttons + action form "Edit dialog →" link
11. Wire `DialogsPanel` into sidebar
12. `src/lib/validate.ts` — new warnings
