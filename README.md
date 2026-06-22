# HoMM Olden Era — Scenario Script Editor

A visual editor for the scenario scripting JSON files used in **Heroes of Might and Magic: Olden Era** (by Unfrozen). Runs in the browser or as a native desktop app on macOS, Windows, and Linux.

**Web app:** https://mimiasei.github.io/map-editor-json-tool/

**Desktop downloads (v0.1.9):**

| Platform | Download |
|---|---|
| macOS — Apple Silicon | [Scenario.Script.Editor_0.1.9_aarch64.dmg](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.1.9/Scenario.Script.Editor_0.1.9_aarch64.dmg) |
| macOS — Intel | [Scenario.Script.Editor_0.1.9_x64.dmg](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.1.9/Scenario.Script.Editor_0.1.9_x64.dmg) |
| Windows | [Scenario.Script.Editor_0.1.9_x64-setup.exe](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.1.9/Scenario.Script.Editor_0.1.9_x64-setup.exe) |
| Linux | [Scenario.Script.Editor_0.1.9_amd64.AppImage](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.1.9/Scenario.Script.Editor_0.1.9_amd64.AppImage) |

> **macOS note:** the app is not notarized by Apple. Gatekeeper will block it — especially on Apple Silicon. The reliable workaround is to run this once in Terminal after copying the app to `/Applications`:
> ```
> xattr -dr com.apple.quarantine "/Applications/Scenario Script Editor.app"
> ```
> Then open it normally. "Open Anyway" in System Settings is not sufficient on Apple Silicon.

---

## What it does

The in-game map editor does not expose scenario scripting. Quest flow, win/lose conditions, story dialogs, hero buffs, difficulty scaling, and all other event-driven behaviour are controlled through a `.json` file that map creators currently hand-edit through trial and error.

This tool gives that file a visual interface:

- **Import** an existing scenario JSON and browse its structure in a tree
- **Edit** counters, interruptions, quests, sub-quests, triggers, conditions, and actions through structured forms
- **Author dialog flows** — build branching NPC conversations with player choices, speaker titles, and map actions per slide
- **Localise** — manage all English text tokens for dialogs and quest names in one panel
- **Export** back to a correctly formatted scenario JSON, or as a **distributable map ZIP** ready to drop next to `Core.zip`

It is a companion to the map editor, not a replacement for it.

---

## Features

- Full CRUD for the entire scenario object graph: counters → interruptions → quests → sub-quests → triggers → conditions / actions
- ~21 known condition types and ~55 known action types with labelled parameter fields and dropdowns
- Custom / unknown type fallback — forward-compatible with future game updates
- Permissive import — never rejects a file for unknown fields or types
- **Dialog flow editor** — per-dialog-key slide editor with text SIDs, speaker titles, next/end/player-choice flow modes, per-slide map actions, and auto-naming
- **Localization panel** — edit English text tokens for all dialog slides and quest names; highlights missing tokens; import from an existing `customMaps.json`
- **Export map ZIP** — one click produces a distributable ZIP (`DB/dialogs/…` + `Lang/english/texts/customMaps.json`) ready to place next to `Core.zip` in `StreamingAssets/`
- **Project save format** — Save / Save As preserves all editor metadata (`_mapName`, `_dialogs`, `_localization`) so everything round-trips; the game ignores these keys
- Live JSON preview with syntax highlighting and one-click copy
- Validation: errors (duplicate/empty SIDs) and warnings (dangling references, empty triggers, missing dialog flows, missing localisation tokens)
- Duplicate any node in the tree
- Resizable sidebar / editor columns
- Undo / redo (100-step history)
- SID autocomplete across the whole scenario
- Command palette (Ctrl+K) for quick navigation
- Event timeline dialog — chronological view of all triggers
- Quest flow diagram — per-quest DAG visualisation of sub-quest dependencies
- Native desktop app (macOS, Windows, Linux) via Tauri v2 — native file open/save dialogs, menu bar, keyboard shortcuts
- No backend — runs entirely in the browser (or as a standalone desktop app)

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

> Example files are provided for reference/testing purposes only and remain property of Unfrozen.

---

## Project structure

```
src/
├── types/
│   ├── scenario.ts            — TypeScript interfaces for the scenario JSON format
│   └── dialog.ts              — Types for dialog flows (DialogFlow, DialogSlide, DialogAnswer)
├── schema/
│   ├── conditions.ts          — Registry of known condition types + parameters
│   ├── actions.ts             — Registry of known action types + parameters
│   └── zod.ts                 — Zod validation schemas
├── store/useScenarioStore.ts  — Zustand store (CRUD, selection, dialog/loc state)
├── lib/
│   ├── import.ts              — JSON import with best-effort fallback; extracts _* editor keys
│   ├── export.ts              — Tab-indented JSON export; exportProjectJson for save round-trip
│   ├── zip-export.ts          — Assembles distributable map ZIP via jszip
│   └── validate.ts            — Error and warning checks (scenario + dialogs + localisation)
└── components/
    ├── layout/                — AppShell, Toolbar, MapMetaForm
    ├── tree/                  — Sidebar scenario tree (Counters, Interruptions, Quests, Dialogs)
    ├── editors/               — Counter, Interruption, Quest, SubQuest, Trigger editors
    ├── conditions/            — ConditionForm, ConditionList
    ├── actions/               — ActionForm, ActionList
    ├── dialogs/               — DialogEditor modal, LocalizationDialog modal
    └── common/                — JsonPreview, CommandPalette, TimelineDialog, QuestFlowDialog
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

When saved via this editor, the file also includes editor-only metadata keys (`_mapName`, `_dialogs`, `_localization`). These round-trip correctly on re-import and are silently ignored by the game engine.

---

## Contributing

This project is open source and contributions are welcome.

**Good first contributions:**
- Adding missing condition or action types to `src/schema/conditions.ts` / `src/schema/actions.ts`
- Reporting or fixing bugs
- UX improvements

**To contribute:**

1. **Open an issue first.** Before writing any code, create a GitHub issue describing the feature or bug. This keeps work visible, avoids duplicate effort, and lets maintainers give feedback before you invest time in an implementation.
2. Fork the repository and create a feature branch off `main`: `git checkout -b feature/my-feature`
3. Commit your changes with a clear message
4. Push the branch: `git push origin feature/my-feature`
5. Open a pull request that references the issue (e.g. `Closes #42` in the PR description)

Please keep PRs focused — one feature or fix per PR makes review faster. PRs without a corresponding issue may be closed or asked to create one first.

If you have found a new condition/action type in a scenario file not yet covered by the registry, opening an issue or PR with the type name and a `p[]` example is extremely helpful.
