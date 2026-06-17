# HoMM Olden Era — Scenario Script Editor

A browser-based visual editor for the scenario scripting JSON files used in **Heroes of Might and Magic: Olden Era** (by Unfrozen).

Live at: **https://mikkelgrosland.github.io/map-editor-json-tool/**

---

## What it does

The in-game map editor does not expose scenario scripting. Quest flow, win/lose conditions, story dialogs, hero buffs, difficulty scaling, and all other event-driven behaviour are controlled through a `.json` file that map creators currently hand-edit through trial and error.

This tool gives that file a visual interface:

- **Import** an existing scenario JSON and browse its structure in a tree
- **Edit** counters, interruptions, quests, sub-quests, triggers, conditions, and actions through structured forms
- **Export** back to a correctly formatted JSON (tab-indented, matching the game's style) ready to drop into the map

It is a companion to the map editor, not a replacement for it.

---

## Features

- Full CRUD for the entire scenario object graph: counters → interruptions → quests → sub-quests → triggers → conditions / actions
- ~21 known condition types and ~55 known action types with labelled parameter fields and dropdowns
- Custom / unknown type fallback for any type not yet in the registry — forward-compatible with game updates
- Permissive import — never rejects a file for unknown fields or types
- Live JSON preview panel with syntax highlighting and one-click copy
- Validation with errors (duplicate / empty SIDs) and warnings (dangling references, empty triggers)
- Dirty-state indicator and confirm-on-new guard
- No backend — runs entirely in the browser

---

## Tech stack

| Concern | Library |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Validation | Zod |
| Deploy | GitHub Actions → GitHub Pages |

---

## Getting started

```bash
npm install
npm run dev       # dev server at http://localhost:5173/map-editor-json-tool/
npm run build     # production build into dist/
```

---

## Example files

The `examples/` directory contains scenario JSON files that can be imported directly into the tool:

| File |
|---|
| `example_01.json` |
| `example_02.json` |
| `example_03.json` |
| `example_04.json` |
| `example_05.json` |
| `example_06.json` |
| `example_07.json` |
| `example_08.json` |

---

## Project structure

```
src/
├── types/scenario.ts          — TypeScript interfaces for the JSON format
├── schema/
│   ├── conditions.ts          — Registry of known condition types + parameters
│   ├── actions.ts             — Registry of known action types + parameters
│   └── zod.ts                 — Zod validation schemas
├── store/useScenarioStore.ts  — Zustand store (all CRUD + selection state)
├── lib/
│   ├── import.ts              — JSON import with best-effort fallback
│   ├── export.ts              — Tab-indented JSON export + download trigger
│   └── validate.ts            — Error and warning checks
└── components/
    ├── layout/                — AppShell, Toolbar
    ├── tree/                  — Sidebar scenario tree
    ├── editors/               — Counter, Interruption, Quest, SubQuest, Trigger editors
    ├── conditions/            — ConditionForm, ConditionList
    ├── actions/               — ActionForm, ActionList
    └── common/                — JsonPreview
```

---

## Scenario JSON format overview

The root object has three top-level arrays:

```jsonc
{
  "counters": [ { "sid": "my_counter", "value": 0 } ],
  "interruptions": [ /* combat intercept triggers */ ],
  "quests": [
    {
      "sid": "main_quest",
      "activeOnStart": true,
      "subQuests": [
        {
          "sid": "main_quest_1",
          "activeOnStart": true,
          "triggers": [
            {
              "conditionsLogic": "And",
              "conditions": [ { "c": "StartTurn", "p": ["1"] } ],
              "actions":    [ { "a": "Dialog",   "p": ["intro_dialog"] } ]
            }
          ]
        }
      ]
    }
  ]
}
```

Conditions use the `"c"` key; actions use the `"a"` key. Parameters are always a string array `"p"`.
