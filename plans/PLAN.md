# HoMM Olden Era Map Scripting Tool — Implementation Plan

## Project Overview

This is a browser-based visual editor for creating and editing the scenario JSON scripting files used in **Heroes of Might and Magic: Olden Era** (Early Access, by Unfrozen).

The tool is a **companion to the in-game map editor** — not a replacement for it. The map editor handles map layout, hero/squad placement, and assigns entity IDs (e.g. `demon_hero_6`, `E_Squad`). This tool handles the scripting JSON file that controls quests, events, win/lose conditions, dialog, hero buffs, difficulty scaling, and all other scriptable game events.

---

## Background: The JSON Format

### What is the JSON file?

Every hand-crafted scenario map in HoMM Olden Era can have a companion `.json` file with the same base name as the map. This file defines all scripted events, quest logic, and story flow for the scenario.

### Top-level structure

```json
{
  "counters": [...],
  "interruptions": [...],
  "quests": [...]
}
```

### Section 1: `counters`

An array of named integer variables used to track game state. These are referenced by condition and action types throughout the rest of the file.

```json
{ "sid": "main_quest_stage", "value": 0 }
```

- `sid` (string): Unique identifier for the counter. Used by `Counter` conditions and `CounterPlus`/`CounterSetRandom` actions.
- `value` (number): Initial value, usually `0`.

### Section 2: `interruptions`

An array of event hooks that fire when specific in-game interactions occur (e.g. before/after a battle). Unlike quests, interruptions are not structured around subquests — they have a flat list of actions that execute when the interruption fires.

```json
{
  "sid": "interaction_with_demon_hero_6_before_win",
  "interruption": "BeforeIamVsHero",
  "activeOnStart": true,
  "p": ["demon_hero_6"],
  "actions": [
    { "a": "Dialog", "p": ["som_main_quest_line_before_win"] }
  ]
}
```

Fields:
- `sid` (string): Unique identifier.
- `interruption` (string): Type of hook. Known values: `BeforeIamVsHero`, `AfterIamWinVsHero`.
- `activeOnStart` (boolean): Whether the interruption is active at game start.
- `p` (string[]): Parameters — typically the hero entity ID to watch.
- `actions` (Action[]): Actions to execute when the interruption fires.

### Section 3: `quests`

The main scripting system. An array of quest objects, each containing subquests, which contain triggers, which contain conditions and actions.

**Hierarchy:**

```
Quest
└── SubQuest[]
    └── Trigger[]
        ├── Condition[] (when to fire)
        └── Action[]    (what to do)
```

#### Quest fields:

```json
{
  "sid": "main_quest_line",
  "main": true,
  "hidden": false,
  "comment": "optional developer note",
  "activeOnStart": true,
  "name": "song_of_murmurwood_name",
  "sharing": "Clone",
  "subQuests": [...]
}
```

- `sid` (string): Unique identifier. Referenced by `NextQuest`, `EndQuest`, `SubQuestActivate`, `SubQuestDeactivate`, `TriggerClearCustom` actions.
- `main` (boolean, optional): Whether this is a main quest (visible to player as a primary objective).
- `hidden` (boolean, optional): Whether the quest is hidden from the quest log.
- `comment` (string, optional): Developer note, not used by the game engine.
- `activeOnStart` (boolean): Whether the quest is active at game start.
- `name` (string, optional): Localization key for the quest name shown in the quest log.
- `sharing` (string, optional): Known value: `"Clone"`. Purpose not fully documented; appears on all quests in the example.
- `subQuests` (SubQuest[]): Array of subquests.

#### SubQuest fields:

```json
{
  "sid": "1",
  "activeOnStart": true,
  "name": "song_of_murmurwood_sub_1",
  "comment": "optional developer note",
  "triggers": [...]
}
```

- `sid` (string): Identifier within the parent quest. Referenced by `SubQuestActivate`, `SubQuestDeactivate`, `TriggerClearCustom`.
- `activeOnStart` (boolean): Whether the subquest is active at game start.
- `name` (string, optional): Localization key for the subquest name.
- `comment` (string, optional): Developer note.
- `triggers` (Trigger[]): Array of triggers.

#### Trigger fields:

```json
{
  "conditionsLogic": "And",
  "repeat": true,
  "conditions": [...],
  "actions": [...]
}
```

- `conditionsLogic` (string, optional): `"And"` (default) or presumably `"Or"`. Controls how multiple conditions are evaluated.
- `repeat` (boolean, optional): If `true`, the trigger can fire multiple times. If `false`/omitted, fires once then deactivates.
- `conditions` (Condition[]): Array of conditions that must be met.
- `actions` (Action[]): Array of actions to execute when conditions are met.

#### Condition object:

```json
{ "c": "ConditionType", "p": ["param1", "param2"] }
```

Special case — `StartTurn` can carry a named `counter` property:
```json
{ "c": "StartTurn", "counter": 7 }
```

- `c` (string): Condition type (see registry below).
- `p` (string[], optional): Parameters. Some conditions have no parameters (e.g. `StartTurn`, `StartWeek`).
- `counter` (number, optional): Seen on `StartTurn`, likely specifies a turn number to fire on.

#### Action object:

```json
{ "a": "ActionType", "p": ["param1", "param2"] }
```

- `a` (string): Action type (see registry below).
- `p` (string[], optional): Parameters. Some actions have no parameters (e.g. `GameVictory`, `GameLose`).

---

## Condition Registry

All conditions observed in `song_of_murmurwood.json`:

| Type | Parameters | Description |
|------|-----------|-------------|
| `StartTurn` | `[turn, player]` or none; optional `counter` property | Fires at the start of a specific turn for a specific player. No params = any turn. |
| `StartWeek` | none | Fires at the start of any week. |
| `AnyStartTurn` | `["-1", "-1", "-1"]` (observed) | Fires at the start of any player's turn. Params purpose unclear. |
| `Counter` | `[counterSid, operator, value]` | Checks a counter. Operator is `"="`. Presumably also `">"`, `"<"`, etc. |
| `HeroKill` | `[heroSid]` | Fires when the specified hero is killed. |
| `SquadKill` | `[squadSid]` | Fires when the specified squad/neutral stack is defeated. |
| `ObjectLose` | `[objectSid]` | Fires when the specified map object (e.g. a town) is lost/captured by the enemy. |
| `DifficultyCustomMap` | `["Neutral", "1"\|"2"\|"3"]` | Checks the custom map difficulty level. Used to branch behavior per difficulty tier. |

---

## Action Registry

All actions observed in `song_of_murmurwood.json`:

### Game Flow
| Type | Parameters | Description |
|------|-----------|-------------|
| `GameVictory` | none | Triggers the victory screen for the player. |
| `GameLose` | none | Triggers the defeat screen for the player. |
| `Dialog` | `[dialogKey]` | Shows a story dialog using the given localization key. |
| `Print` | `[message]` | Prints a debug/achievement message. Observed with achievement strings. |

### Quest Management
| Type | Parameters | Description |
|------|-----------|-------------|
| `CurrentSubQuestDone` | `[]` (empty array) | Marks the current subquest as complete. |
| `SubQuestActivate` | `[questSid, subQuestSid]` | Activates a specific subquest on a quest. |
| `SubQuestDeactivate` | `[questSid, subQuestSid]` | Deactivates a specific subquest on a quest. |
| `NextQuest` | `[questSid]` | Advances to the next quest (activates it). |
| `EndQuest` | `[questSid]` | Ends/closes the specified quest. |

### Counter Manipulation
| Type | Parameters | Description |
|------|-----------|-------------|
| `CounterPlus` | `[counterSid, amount]` | Increments a counter by the given amount. Note: `"0"` seen — may mean "increment by 1" or "reset". |
| `CounterSetRandom` | `[counterSid, min, max]` | Sets a counter to a random integer between min and max (inclusive). |

### Hero Manipulation
| Type | Parameters | Description |
|------|-----------|-------------|
| `GiveUnitHero` | `[unitSid, count, heroSid]` | Adds units to a hero's army. |
| `GiveUnitHeroPerWeek` | `[unitSid, count, heroSid]` | Adds units to a hero's army each week (repeating). |
| `RemoveUnitHero` | `[unitSid, "all"\|count, heroSid]` | Removes units from a hero's army. `"all"` removes all of that type. |
| `GiveStatsHero` | `[statName, heroSid, amount]` | Adds stat points to a hero. Stat names: `offence`, `defence`, `spellPower`, `intelligence`, `movementBonus`. |
| `GiveExpHero` | `[amount, heroSid]` | Gives experience points to a hero. |
| `GiveItemHero` | `[itemSid, heroSid]` | Gives an artifact/item to a hero. |
| `AddSkillHero` | `[skillSid, heroSid]` | Adds a skill level to a hero (call multiple times to add multiple levels). |
| `AddSpellHero` | `[spellSid, heroSid]` | Teaches a spell to a hero. |
| `AddBuffHeroDays` | `[buffSid, heroSid, days]` | Applies a buff to a hero for N days. Use `"-1"` for permanent. |
| `HeroResetMovePointsMax` | `[heroSid]` | Resets a hero's movement points to maximum. |
| `SpawnHero` | `[heroSid, nodeSid, player]` | Spawns a hero at the given map node for the given player. |
| `DeleteHero` | `[heroSid]` | Removes a hero from the map permanently. |
| `DisableAiHero` | `[heroSid]` | Disables AI control for a hero (used to freeze enemy heroes in cutscene-like events). |
| `TeleportHero` | `[heroSid, nodeSid]` | Teleports a hero to a map node. |
| `HeroToNode` | `[heroSid, nodeSid]` | Moves a hero to a map node (similar to TeleportHero; exact difference unclear). |

### Map / Camera
| Type | Parameters | Description |
|------|-----------|-------------|
| `MoveCamera` | `[nodeSid]` | Moves the camera to focus on a map node. |
| `RevealFogOfWar` | `[nodeSid, radius]` | Reveals fog of war around a node with the given radius. |

### Squad / Neutral
| Type | Parameters | Description |
|------|-----------|-------------|
| `IncreaseStrengthSquad` | `[squadSid, "tier,level"]` | Upgrades a neutral squad. Format `"0,0"` = no upgrade, `"0,2"` = upgrade by 2 levels. |

### Trigger Management
| Type | Parameters | Description |
|------|-----------|-------------|
| `TriggerClearCustom` | `[questSid, subQuestIndex, triggerIndex, flag]` | Clears/resets a specific trigger in a quest. Indices are 0-based. Last param purpose unclear (seen as `"0"` and `"1"`). |

---

## Entity ID Conventions (observed)

Entity IDs are assigned in the map editor and referenced by string in the JSON. Patterns seen in the example:

- **Heroes**: `demon_hero_3`, `demon_hero_6`, `nature_hero_3`, `nature_hero_9`
- **Squads/neutrals**: `E_Squad`, `W_Squad`, `L_Squad`, `F_Squad`, `E_Squad_1`, `W_Squad_2`, etc.
- **Map nodes** (positions): Numeric strings — `"47"`, `"470"`, `"892"`, etc.
- **Units**: `hive_queen`, `jaw`, `locust_upg`, `godslayer_upg_alt`, etc.
- **Skills**: `skill_faction_demons`, `skill_assault`, `skill_siege`, `skill_formation`, etc.
- **Spells**: `day_1_magic_healing_water`, `night_2_magic_web`, etc.
- **Buffs**: `campaign_heroStatBuff_magic_day_3`, `campaign_infinite_moves_buff`, etc.
- **Items/artifacts**: `catechism_of_night_magic_artifact`, etc.
- **Dialog keys**: `som_main_quest_line_start`, etc. (localization keys resolved elsewhere)
- **Cities/objects**: `city`

---

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | React 18 + TypeScript | Strong ecosystem for complex nested form UIs |
| Build | Vite | Fast dev, zero-config TS support |
| Styling | Tailwind CSS + shadcn/ui | Rapid UI, accessible components out of the box |
| State | Zustand | Lightweight, excellent for single-document state |
| Validation | Zod | Runtime + type-level schema validation |
| File I/O | Browser File API | No backend needed — purely client-side |
| Deployment | GitHub Pages | Free, static hosting via Vite build |

No backend. No server. The tool runs entirely in the browser.

---

## Repository Layout

```
map-editor-json-tool/
├── plans/
│   └── PLAN.md                    # This file
├── examples/
│   └── song_of_murmurwood.json   # Reference scenario JSON
├── public/
│   └── favicon.ico
├── src/
│   ├── main.tsx                   # React entry point
│   ├── App.tsx                    # Root component, layout
│   │
│   ├── types/
│   │   └── scenario.ts            # TypeScript interfaces for the full JSON structure
│   │
│   ├── schema/
│   │   ├── zod.ts                 # Zod schemas mirroring the TypeScript types
│   │   ├── conditions.ts          # Condition type registry (known types + param definitions)
│   │   └── actions.ts             # Action type registry (known types + param definitions)
│   │
│   ├── store/
│   │   └── useScenarioStore.ts    # Zustand store: document state + CRUD operations + UI state
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx       # Top-level layout: toolbar + 3 panels
│   │   │   ├── Toolbar.tsx        # Import, Export, New, Validate, column toggles
│   │   │   └── PanelToggle.tsx    # Column visibility toggle buttons
│   │   │
│   │   ├── tree/
│   │   │   ├── ScenarioTree.tsx   # Full tree: Counters | Interruptions | Quests
│   │   │   ├── QuestNode.tsx      # Expandable quest with subquests
│   │   │   ├── SubQuestNode.tsx   # Expandable subquest with triggers
│   │   │   └── TriggerNode.tsx    # Trigger row (collapsed summary)
│   │   │
│   │   ├── editors/
│   │   │   ├── CounterEditor.tsx      # Form for Counter
│   │   │   ├── InterruptionEditor.tsx # Form for Interruption
│   │   │   ├── QuestEditor.tsx        # Form for Quest metadata
│   │   │   ├── SubQuestEditor.tsx     # Form for SubQuest metadata
│   │   │   └── TriggerEditor.tsx      # Form for Trigger (includes condition/action lists)
│   │   │
│   │   ├── conditions/
│   │   │   ├── ConditionList.tsx      # List of conditions with add/remove
│   │   │   └── ConditionForm.tsx      # Single condition: type dropdown + dynamic params
│   │   │
│   │   ├── actions/
│   │   │   ├── ActionList.tsx         # List of actions with add/remove
│   │   │   └── ActionForm.tsx         # Single action: type dropdown + dynamic params
│   │   │
│   │   └── common/
│   │       ├── JsonPreview.tsx        # Syntax-highlighted read-only JSON panel
│   │       ├── SidInput.tsx           # Validated text input for SID fields
│   │       ├── ParamField.tsx         # Generic parameter input field
│   │       └── ValidationPanel.tsx    # Validation error/warning display
│   │
│   └── lib/
│       ├── import.ts              # Parse + validate imported JSON → store
│       ├── export.ts              # Serialize store state → formatted JSON string
│       └── validate.ts            # Business-logic validation rules (cross-reference checks)
│
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── .github/
    └── workflows/
        └── deploy.yml             # GitHub Actions: build + deploy to GitHub Pages
```

---

## TypeScript Type Definitions

These go in `src/types/scenario.ts`:

```typescript
export interface ScenarioFile {
  counters: Counter[];
  interruptions: Interruption[];
  quests: Quest[];
}

export interface Counter {
  sid: string;
  value: number;
}

export interface Interruption {
  sid: string;
  interruption: InterruptionType | string;
  activeOnStart: boolean;
  p: string[];
  actions: Action[];
}

export type InterruptionType = "BeforeIamVsHero" | "AfterIamWinVsHero";

export interface Quest {
  sid: string;
  main?: boolean;
  hidden?: boolean;
  comment?: string;
  activeOnStart: boolean;
  name?: string;
  sharing?: string;
  subQuests: SubQuest[];
}

export interface SubQuest {
  sid: string;
  activeOnStart: boolean;
  name?: string;
  comment?: string;
  triggers: Trigger[];
}

export interface Trigger {
  conditionsLogic?: "And" | "Or";
  repeat?: boolean;
  conditions: Condition[];
  actions: Action[];
}

export interface Condition {
  c: string;
  p?: string[];
  counter?: number;   // Extra property seen on StartTurn
}

export interface Action {
  a: string;
  p?: string[];
}
```

---

## Schema / Registry Design

The condition and action registries live in `src/schema/conditions.ts` and `src/schema/actions.ts`. Each entry defines:

```typescript
interface ParamDef {
  label: string;        // Display name for the field
  hint?: string;        // Placeholder or example
  required: boolean;
}

interface ConditionDef {
  type: string;          // The "c" value
  label: string;         // Human-readable name
  description: string;   // What this condition does
  params: ParamDef[];    // Ordered list of positional params
  extraFields?: {        // Named fields beyond "p" (e.g. counter on StartTurn)
    [key: string]: ParamDef;
  };
}

interface ActionDef {
  type: string;          // The "a" value
  label: string;
  description: string;
  params: ParamDef[];
}
```

Both registries export a `Record<string, ConditionDef | ActionDef>` and an ordered array for dropdowns.

**Important:** The tool must support "custom/unknown" types — if a condition or action type is not in the registry, the user should still be able to use it by entering the type string manually and providing raw parameter strings. This ensures forward compatibility as new types are discovered.

---

## Zustand Store Design

`src/store/useScenarioStore.ts` exports a single store with:

```typescript
interface ScenarioStore {
  // Document state
  scenario: ScenarioFile;
  isDirty: boolean;

  // Selection state
  selectedType: "counter" | "interruption" | "quest" | "subquest" | "trigger" | null;
  selectedPath: number[];  // Path to selected item, e.g. [questIdx, subQuestIdx, triggerIdx]

  // UI state
  panels: { sidebar: boolean; editor: boolean; preview: boolean };

  // Document CRUD
  setScenario: (scenario: ScenarioFile) => void;
  resetScenario: () => void;

  // Counter operations
  addCounter: () => void;
  updateCounter: (index: number, counter: Counter) => void;
  removeCounter: (index: number) => void;

  // Interruption operations
  addInterruption: () => void;
  updateInterruption: (index: number, interruption: Interruption) => void;
  removeInterruption: (index: number) => void;
  addInterruptionAction: (interruption index: number) => void;
  updateInterruptionAction: (interruptionIndex: number, actionIndex: number, action: Action) => void;
  removeInterruptionAction: (interruptionIndex: number, actionIndex: number) => void;

  // Quest operations
  addQuest: () => void;
  updateQuest: (questIndex: number, quest: Partial<Quest>) => void;
  removeQuest: (questIndex: number) => void;

  // SubQuest operations
  addSubQuest: (questIndex: number) => void;
  updateSubQuest: (questIndex: number, subQuestIndex: number, subQuest: Partial<SubQuest>) => void;
  removeSubQuest: (questIndex: number, subQuestIndex: number) => void;

  // Trigger operations
  addTrigger: (questIndex: number, subQuestIndex: number) => void;
  updateTrigger: (questIndex: number, subQuestIndex: number, triggerIndex: number, trigger: Partial<Trigger>) => void;
  removeTrigger: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void;

  // Condition operations
  addCondition: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void;
  updateCondition: (...path: number[], condition: Condition) => void;
  removeCondition: (...path: number[]) => void;

  // Action operations (for triggers)
  addAction: (questIndex: number, subQuestIndex: number, triggerIndex: number) => void;
  updateAction: (...path: number[], action: Action) => void;
  removeAction: (...path: number[]) => void;

  // Selection
  setSelection: (type: SelectionType, path: number[]) => void;
  clearSelection: () => void;

  // Panel toggles
  togglePanel: (panel: "sidebar" | "editor" | "preview") => void;
}
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLBAR: [New] [Import] [Export] [Validate]    [≡][✎][{}] toggles │
├────────────────┬──────────────────────────┬─────────────────────────┤
│  SIDEBAR       │  EDITOR PANEL            │  JSON PREVIEW           │
│  (toggleable)  │  (toggleable)            │  (toggleable)           │
│                │                          │                         │
│  ▸ Counters(3) │  ← form for selected     │  {                      │
│  ▸ Interrupts  │    entity shows here →   │    "counters": [...],   │
│  ▾ Quests      │                          │    "interruptions": []  │
│    ▾ intro     │  [Counter Editor]        │    "quests": [...]      │
│      ▸ sq: 1   │  SID: [_____________]    │  }                      │
│      ▸ sq: 2   │  Value: [___]            │                         │
│    ▸ win_lose  │                          │  [Copy JSON]            │
│    ▾ main_ql   │                          │                         │
│      ▾ sq: 1   │  [Trigger Editor]        │                         │
│        T: 1    │  Logic: [And▾] [repeat]  │                         │
│        T: 2    │  Conditions: [+]         │                         │
│      ▸ sq: 2   │    StartTurn [p: 1,1]    │                         │
│                │  Actions: [+]            │                         │
│  [+ Quest]     │    Dialog [p: key_name]  │                         │
└────────────────┴──────────────────────────┴─────────────────────────┘
```

The 3 columns are independently toggleable via buttons in the toolbar. All 3 are visible by default.

---

## Import/Export Behaviour

### Import
- Toolbar "Import" button → opens `<input type="file" accept=".json">`
- File is read via `FileReader.readAsText()`
- Parsed with `JSON.parse()`
- Validated against the Zod schema (errors shown in a toast/panel, but import proceeds even with warnings — the tool should be permissive)
- Loaded into the Zustand store

### Export
- Toolbar "Export" button → serializes the Zustand store's `scenario` state
- Pretty-printed JSON (2-space indent, tab indented for readability matching the original format)
- Triggers `<a download="scenario.json">` to save the file
- Name defaults to `scenario.json` — user can rename in the save dialog

---

## Validation Rules

Implemented in `src/lib/validate.ts`. Run on export and on-demand via "Validate" button.

### Errors (prevent clean export, show prominently)
- Duplicate `sid` values within the same section (counters, interruptions, quests)
- Duplicate subquest `sid` values within the same quest
- Empty `sid` fields

### Warnings (shown but do not block export)
- Actions with `a: "CounterPlus"` or `a: "Counter"` referencing a `sid` not defined in `counters`
- `SubQuestActivate`/`SubQuestDeactivate`/`TriggerClearCustom` referencing a quest `sid` not defined in `quests`
- `SubQuestActivate`/`SubQuestDeactivate` referencing a subquest `sid` not found in the target quest
- Triggers with an empty `conditions` array
- Triggers with an empty `actions` array
- Unknown condition/action types (not in the registry) — warn but allow

---

## Implementation Order (15 Steps)

Follow this order strictly. Each step builds on the previous.

### Step 1: Project Scaffolding
```bash
cd /Users/mikkelgrosland/repos/map-editor-json-tool
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install zustand zod
npm install class-variance-authority clsx tailwind-merge
npx shadcn@latest init
```

Configure:
- `vite.config.ts`: set `base: "/map-editor-json-tool/"` for GitHub Pages
- `tailwind.config.ts`: standard setup
- `tsconfig.json`: ensure `strict: true`, path aliases `@/` → `src/`
- Add `src/lib/utils.ts` with the standard `cn()` helper

Install shadcn/ui components needed for MVP:
```bash
npx shadcn@latest add button input label select checkbox switch textarea tooltip badge separator scroll-area
```

### Step 2: Types + Registry
Create `src/types/scenario.ts` with all TypeScript interfaces (see Type Definitions section above).

Create `src/schema/conditions.ts` — export `CONDITION_REGISTRY` (Record) and `CONDITION_LIST` (array for dropdowns). Include all known conditions from the registry table above.

Create `src/schema/actions.ts` — export `ACTION_REGISTRY` (Record) and `ACTION_LIST` (array for dropdowns). Include all known actions from the registry table above.

Create `src/schema/zod.ts` — Zod schemas for `ScenarioFile`, `Counter`, `Interruption`, `Quest`, `SubQuest`, `Trigger`, `Condition`, `Action`. Use `z.string()` for all `sid` and `p` string params (permissive — don't restrict to known values at the Zod level).

### Step 3: Zustand Store
Create `src/store/useScenarioStore.ts`.

The store holds:
- `scenario: ScenarioFile` — the full document
- `isDirty: boolean` — whether unsaved changes exist
- `selectedType / selectedPath` — currently selected item in the tree
- `panels: { sidebar: boolean; editor: boolean; preview: boolean }`

Implement all CRUD operations from the Store Design section above. Use Zustand's `immer` middleware (or manual immutable updates) for clean nested state mutation.

Provide a `EMPTY_SCENARIO` constant as the default state:
```typescript
const EMPTY_SCENARIO: ScenarioFile = {
  counters: [],
  interruptions: [],
  quests: [],
};
```

### Step 4: App Shell + Layout
Create `src/App.tsx` and `src/components/layout/AppShell.tsx`.

The layout is a CSS Grid:
- Row 1: Toolbar (fixed height)
- Row 2: Three columns (sidebar | editor | preview), each independently toggled

When a panel is hidden, its column collapses to zero width. The remaining panels expand to fill the space.

Use `grid-cols` with conditional `hidden` class on each panel.

### Step 5: Toolbar
Create `src/components/layout/Toolbar.tsx`.

Buttons:
- **New**: Confirm if dirty, then reset store to `EMPTY_SCENARIO`
- **Import**: Trigger hidden `<input type="file">`, read file, call `import.ts`
- **Export**: Call `export.ts`, trigger download
- **Validate**: Run `validate.ts`, show results in a modal or side panel

Column toggles (3 icon buttons, right-aligned):
- Sidebar toggle (list icon)
- Editor toggle (pencil icon)
- Preview toggle (braces icon)

### Step 6: Sidebar Tree
Create `src/components/tree/ScenarioTree.tsx`.

Structure:
```
▾ Counters (n)
    counter_sid_1
    counter_sid_2
    [+ Add Counter]
▾ Interruptions (n)
    interruption_sid_1
    [+ Add Interruption]
▾ Quests (n)
  ▾ quest_sid
    ▾ subquest_sid
        Trigger 1
        Trigger 2
      [+ Add Trigger]
    [+ Add SubQuest]
  [+ Add Quest]
```

Clicking any item calls `setSelection()` in the store. The selected item is highlighted.

Each item has a small delete icon on hover (or a context menu with duplicate/delete).

### Step 7: Counter Editor
Create `src/components/editors/CounterEditor.tsx`.

Rendered when `selectedType === "counter"`.

Fields:
- `sid`: text input (required)
- `value`: number input (default 0)

Changes update the store immediately (controlled inputs).

### Step 8: Interruption Editor
Create `src/components/editors/InterruptionEditor.tsx`.

Rendered when `selectedType === "interruption"`.

Fields:
- `sid`: text input
- `interruption`: dropdown (`BeforeIamVsHero`, `AfterIamWinVsHero`) + free-text fallback
- `activeOnStart`: toggle/checkbox
- `p`: list of string params (add/remove)
- `actions`: use `<ActionList>` component (see Step 11)

### Step 9: Quest + SubQuest Editors
Create `src/components/editors/QuestEditor.tsx` and `SubQuestEditor.tsx`.

**QuestEditor** fields:
- `sid`: text input
- `main`: checkbox
- `hidden`: checkbox
- `activeOnStart`: checkbox
- `name`: text input (localization key)
- `sharing`: text input (default `"Clone"`)
- `comment`: text input

**SubQuestEditor** fields:
- `sid`: text input
- `activeOnStart`: checkbox
- `name`: text input
- `comment`: text input

### Step 10: Trigger Editor
Create `src/components/editors/TriggerEditor.tsx`.

Rendered when `selectedType === "trigger"`.

Fields:
- `conditionsLogic`: dropdown — `And`, `Or`, or empty
- `repeat`: checkbox

Then two sections:
- **Conditions** — uses `<ConditionList>` (Step 11)
- **Actions** — uses `<ActionList>` (Step 11)

### Step 11: Condition + Action Forms
These are the most complex components.

**`src/components/conditions/ConditionForm.tsx`**:
- A dropdown of known condition types + `"custom"` option
- When a known type is selected: render labelled fields for each parameter from the registry
- When `"custom"` is selected: show a text input for the type string + a free-form param list
- For `StartTurn` specifically: also render an optional `counter` number field

**`src/components/conditions/ConditionList.tsx`**:
- Renders a list of `ConditionForm` instances
- [+ Add Condition] button at the bottom
- Delete button on each row

**`src/components/actions/ActionForm.tsx`** and **`ActionList.tsx`**: Same pattern as conditions.

Parameter fields for both:
- String params → `<Input type="text">`
- Numeric params → `<Input type="number">`
- Boolean params → `<Checkbox>`
- Params with known enum values → `<Select>`

### Step 12: JSON Preview Panel
Create `src/components/common/JsonPreview.tsx`.

- Subscribes to the Zustand store's `scenario` state
- Calls `JSON.stringify(scenario, null, 2)` to render
- Displays in a `<pre>` or scrollable `<code>` block with monospace font
- "Copy" button copies the JSON to clipboard
- Syntax highlighting: either use a lightweight library (`prism-react-renderer` or `react-syntax-highlighter`) or implement basic token coloring manually

### Step 13: Import/Export Logic
Create `src/lib/import.ts`:
```typescript
export function importScenario(jsonText: string): { 
  scenario: ScenarioFile | null; 
  errors: string[]; 
  warnings: string[];
}
```
- Parses JSON
- Validates with Zod schema
- Returns the scenario + any validation messages

Create `src/lib/export.ts`:
```typescript
export function exportScenario(scenario: ScenarioFile): string
```
- Serializes to JSON string
- Uses `JSON.stringify(scenario, null, "\t")` to match the tab-indented format of the original files

Create download trigger helper in the same file.

### Step 14: Validation Layer
Create `src/lib/validate.ts`:
```typescript
export interface ValidationResult {
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
}

export interface ValidationMessage {
  path: string;      // Human-readable path, e.g. "Quest 'intro' > SubQuest '1' > Trigger 2"
  message: string;
}

export function validateScenario(scenario: ScenarioFile): ValidationResult
```

Implement the validation rules listed in the Validation Rules section above.

### Step 15: GitHub Pages Deployment
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/deploy-pages@v4
        with:
          folder: dist
```

Also set `base` in `vite.config.ts`:
```typescript
export default defineConfig({
  base: "/map-editor-json-tool/",
  plugins: [react()],
})
```

---

## shadcn/ui Components to Install

Run these after `npx shadcn@latest init`:
```bash
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add select
npx shadcn@latest add checkbox
npx shadcn@latest add switch
npx shadcn@latest add textarea
npx shadcn@latest add tooltip
npx shadcn@latest add badge
npx shadcn@latest add separator
npx shadcn@latest add scroll-area
npx shadcn@latest add dialog
npx shadcn@latest add alert
```

---

## Key Design Decisions

1. **Permissive import**: The tool should load any JSON that structurally resembles the scenario format, even if it has unknown fields or unknown condition/action types. Never block the user from opening a file.

2. **Custom/unknown types**: Both condition and action forms must support a "custom" mode where the user types in an arbitrary type string and provides raw string parameters. This handles undiscovered types or future additions.

3. **No backend**: All file I/O uses the browser File API. No server, no backend, no database.

4. **JSON output fidelity**: The exported JSON must be valid for the game engine. Empty `p` arrays should be exported as `[]`, not omitted, where the original format uses them (e.g. `CurrentSubQuestDone`).

5. **Extend registry without code changes**: When new example files are added to `examples/` and new action/condition types are discovered, adding them to the registry in `src/schema/conditions.ts` and `src/schema/actions.ts` should be the only required change.

---

## Open Questions (for future sessions or when more example files are available)

1. What does `sharing: "Clone"` actually do in the game engine?
2. What is the full list of valid `DifficultyCustomMap` difficulty values? (Observed: `"Neutral"` with levels `"1"`, `"2"`, `"3"`)
3. What is the exact semantics of `CounterPlus` with `"0"` as the amount? Does `"0"` mean "reset to 0" or "increment by 0"?
4. What is the semantic difference between `TeleportHero` and `HeroToNode`?
5. What does the 4th parameter of `TriggerClearCustom` do? (Seen as `"0"` and `"1"`)
6. Are there other condition/action types not present in the single example file?
7. Does `conditionsLogic: "Or"` actually work, or is only `"And"` supported?
8. What is the full set of valid `interruption` types?
9. What is the `counter` property on `StartTurn` — is it a turn count threshold?
10. What is the `AnyStartTurn` condition's parameter format (`["-1", "-1", "-1"]`)? Does `-1` mean "any"?

---

## Additional Notes for New Sessions

- The `examples/` directory is the canonical source of truth for the JSON format. Before writing any type definitions or registry entries, re-read the example files to verify.
- Do not add packages beyond what is listed in this plan without noting the deviation.
- The working directory for the project is `/Users/mikkelgrosland/repos/map-editor-json-tool/`.
- After implementation, test by importing `examples/song_of_murmurwood.json`, verifying the tree renders correctly, making a small edit, and re-exporting — then diffing the output against the original.
- The tool is intentionally narrow in scope. Do not add features not listed here without discussion.
