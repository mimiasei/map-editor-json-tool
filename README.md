# HoMM Olden Era — Scenario Script Editor

A visual editor for the scenario scripting JSON files used in **Heroes of Might and Magic: Olden Era** (by Unfrozen). Runs in the browser or as a native desktop app on macOS, Windows, and Linux.

**Web app:** https://mimiasei.github.io/map-editor-json-tool/

**Desktop downloads (v0.6.16):**

| Platform | Download |
|---|---|
| macOS — Apple Silicon | [HommOE.Scenario.Editor_0.6.16_aarch64.dmg](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.6.16/HommOE.Scenario.Editor_0.6.16_aarch64.dmg) |
| Windows | [HommOE.Scenario.Editor_0.6.16_x64-setup.exe](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.6.16/HommOE.Scenario.Editor_0.6.16_x64-setup.exe) |
| Linux | [HommOE.Scenario.Editor_0.6.16_amd64.AppImage](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.6.16/HommOE.Scenario.Editor_0.6.16_amd64.AppImage) |

> **macOS note:** the app is not notarized by Apple. Gatekeeper will block it — especially on Apple Silicon. The reliable workaround is to run this once in Terminal after copying the app to `/Applications`:
> ```
> xattr -dr com.apple.quarantine "/Applications/HommOE Scenario Editor.app"
> ```
> Then open it normally. "Open Anyway" in System Settings is not sufficient on Apple Silicon.

---

## What it does

The in-game map editor does not expose scenario scripting. Quest flow, win/lose conditions, story dialogs, hero buffs, difficulty scaling, and all other event-driven behaviour are controlled through a `.json` file that map creators currently hand-edit through trial and error.

This tool gives that file a visual interface:

- **Import** an existing scenario JSON and browse its structure in a tree
- **Edit** counters, interruptions, quests, sub-quests, triggers, conditions, and actions through structured forms
- **Author dialog flows** — build branching NPC conversations with player choices, speaker titles, and map actions per slide
- **Localise** — manage text tokens for dialogs and quest names in one panel, in English and any of the game's other 15 languages
- **Export** back to a correctly formatted scenario JSON, or as a **distributable map ZIP** ready to drop next to `Core.zip`

It is a companion to the map editor, not a replacement for it.

---

## How to ship a custom map

1. **Build your map** in the game's built-in map editor. It saves a binary map file somewhere on disk.

2. **Write the script** in this tool. Use **Save As** to save the `.json` file **in the same folder as the binary map file**. The game loads whichever `.json` shares a folder with the map.

3. **Author dialogs** — for every `Dialog` action in the script, open the Dialog Editor and build the slides. Fill in English text via the **Localization** button.

4. **Export ZIP** — click **Export ZIP** in the toolbar. Place the resulting `.zip` next to `Core.zip`:
   ```
   HeroesOldenEra_Data/StreamingAssets/
   ├── Core.zip          ← game-owned, do not touch
   └── your_map.zip      ← your dialogs + localization
   ```
   The engine merges your ZIP on top of `Core.zip` at runtime. It is overwritten on game updates, so keep your source files.

   > On desktop, **Publish** does steps 2 and 4 together: it writes the scenario JSON next to
   > your `.map` file and the ZIP into `StreamingAssets/`, showing both resolved paths and
   > flagging anything it would overwrite before it touches the disk.

5. **Iterate** — open the same `.json` back into the editor at any time. All dialog and localization data is stored inside it and round-trips correctly.

---

## Features

- Full CRUD for the entire scenario object graph: counters → interruptions → quests → sub-quests → triggers → conditions / actions
- 55 known condition types and 114 known action types with labelled parameter fields, dropdowns and inline tooltips
- Custom / unknown type fallback — forward-compatible with future game updates
- Permissive import — never rejects a file for unknown fields or types
- **Dialog flow editor** — per-dialog-key slide editor with text SIDs, speaker titles, next/end/player-choice flow modes, per-slide map actions, and auto-naming
- **Editable speaker names** — the name shown above the dialog text is independent of the portrait, so a hero's portrait can speak under any name. Type the name directly and the SID is created for you. Picking a built-in game name instead disables the field and explains why: the engine ignores map overrides of its own text tokens, so renaming needs a SID of your own
- **Full dialog format coverage** — visual five-slot avatar strip matching the game's positions 1–5 (icon, foreground/background layer, `zoomIn`/`zoomOut`/`appear` animations, width), plus voice line, notification, play conditions, story actions, close actions, and `resultDialog` on every slide. Player choices support availability conditions and their own map actions
- **Editable JSON for dialogs** — the JSON column switches between the map scenario and each dialog file, shown exactly as it ships (`{"array":[…]}`). Hand-edits are validated before they apply: duplicate slide IDs, dangling `next`/`Go` targets, and dialogs with no ending are rejected
- **Localization panel** — edit text tokens for all dialog slides and quest names; highlights missing tokens; import from an existing `customMaps.json`
- **Multi-language localisation** — English is the base; add any of the game's 16 languages and translate side by side with the English source visible. Untranslated tokens ship with the English text as a fallback
- **Export map ZIP** — one click produces a distributable ZIP (`DB/dialogs/…` + `Lang/<language>/texts/customMaps.json` for every language you've filled in) ready to place next to `Core.zip` in `StreamingAssets/`
- **Publish map** (desktop) — writes the scenario JSON next to your `.map` file and the ZIP into `StreamingAssets/` in one step, showing both resolved paths and flagging overwrites before it touches anything
- **Project save format** — Save / Save As preserves all editor metadata (`_mapName`, `_dialogs`, `_localization`, `_translations`) so everything round-trips; the game ignores these keys
- **Load .map file** — open the binary `.map` file from your game's map editor to unlock live map context: named entity SIDs are extracted and displayed in the sidebar, entity parameter fields get autocomplete, and the sidecar scenario JSON is loaded automatically if present next to the `.map` file
- **Entity SIDs sidebar section** — lists all user-named entities from the loaded map grouped by type; hover any SID to see its map coordinates (`Map Coords: x, z`); click a used SID to jump to its first trigger reference; copy any SID with one click
- **Spawner heroes in the entity lookup** — a hero placed through a spawner never gets an entity SID, because a hero is already unique by its own SID. Those heroes now appear in their own **Heroes** group in the sidebar (with the resolved English name) and in `mapEntity` autocomplete. Spawners set to a random hero are skipped, as are city spawners whose "also spawn a hero" slot is switched off
- **Map coordinates in action/condition forms** — when an entity SID parameter has a value, its map coordinates are shown inline below the field
- **Game Data Catalog** — load `Core.zip` from your game install (auto-detected on Windows via Steam paths, or pick the file manually on any platform) to populate all entity dropdowns with live game data and real English names. Covers heroes, creatures, artifacts, spells, skills, buffs, and map objects. Falls back to built-in lists when not loaded
- **First-run setup wizard** (desktop) — on first launch, locates `Core.zip` in your game folder and runs the icon extractor in one step, so dropdowns come up populated with names and icons
- **Artwork re-run prompt** (desktop) — when a release teaches the extractor about new icons, a dismissible banner and a count on **More → Extract Thumbnails** say so, rather than leaving the artwork silently missing
- **Icon extraction** (desktop) — a bundled Python sidecar reads the game's Unity asset bundles and writes PNGs to the app's local data folder, giving every dropdown, the Game Database and the hero picker real artwork. Re-runnable at any time from **More → Extract Thumbnails**; everything degrades to letter badges when it has not been run
- **Hero picker** — a portrait-first browser on every hero parameter: heroes grouped by faction (Temple, Necropolis, Dungeon, Grove, Hive, Schism) showing the same portrait the game uses as the dialog speaker, enlarging on hover. The searchable dropdown still works for typing SIDs directly
- **Game Database dialog** — browse all heroes (grouped by faction), creatures, artifacts, spells, skills, and map objects with search and filtering; detail pane shows usage counts (map placements + script references), stats, descriptions, and — when a `.map` file is loaded — the actual map coordinates of every placed instance of that entity (heroes, creature squads, artifacts, and named map objects all show their tile coordinates)
- **Game Dialog Browser** — search all ~769 game dialog flows by ID, speaker, or text; expand any dialog to read its slides; copy the ID into a Dialog action with one click
- **Map object filter** — funnel button on map object dropdowns narrows results by category (interactables, resources, environments, spawns) and interactability; filter persists between sessions
- Searchable dropdowns for all entity parameters (heroes, creatures, artifacts, spells, skills, buffs, map objects) — shows human-readable names alongside SIDs
- **In-editor guides** — built-in knowledge base covering how quests work, trigger patterns, counter tracking, dialog integration, timed events, and common pitfalls; accessible from the toolbar
- **New from template** — start from one of four annotated scenario templates (simple kill quest, counter-based quest, timed event, dialog-driven quest) with inline hints that can be dismissed as you go
- Live JSON preview with syntax highlighting and one-click copy
- Validation: errors (duplicate/empty SIDs, broken dialog flows) and warnings (dangling references, empty triggers, missing dialog flows, missing localisation tokens, speaker labels with no text)
- Duplicate any node in the tree
- Resizable sidebar / editor columns
- **Resizable, movable dialogs** — every content-heavy panel (Dialog Editor, Localization, Timeline, Quest Flow, Statistics, Dialog Browser, Game Database, Hero picker, Guides, Publish) can be dragged by its header and resized from any edge or corner, with a scrollbar whenever the content overflows. Most also remember their own size and position between opens; Game Database and Guides re-centre at their default size each time
- **Theme editor** — switch between light and dark, and on light customise the panel colours, accents, font size and button style; settings persist
- Undo / redo (100-step history)
- SID autocomplete across the whole scenario
- Command palette (Ctrl+K) for quick navigation
- **Event timeline** — chronological view of all triggers grouped by category (turn-based, counter-gated, reactive, random/repeating)
- **Quest flow diagram** — per-quest DAG visualisation of sub-quest dependencies
- **Scenario statistics** — at-a-glance counts and breakdown of quests, triggers, conditions, and actions
- Undockable panels (Tauri desktop) — JSON Preview, Event Timeline, Quest Flow Diagram, Scenario Statistics, and Guides can be popped out into separate windows, which mirror the main window's state live
- **Auto-update** (macOS and Windows desktop) — checks GitHub for newer releases on startup and shows a dismissible banner; the release notes and a one-click "Install and restart" live behind it, or check on demand from the More menu. Your open file and any unsaved changes are saved before the restart and reopened automatically
- Native desktop app (macOS, Windows, Linux) via Tauri v2 — native file open/save dialogs, menu bar, keyboard shortcuts
- No backend — runs entirely in the browser (or as a standalone desktop app)

---

## Tech stack

| Concern | Library |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand (+ zundo for undo/redo) |
| Validation | Zod |
| Desktop | Tauri v2 (Rust), with a PyInstaller + UnityPy sidecar for icon extraction |
| Diagrams | @xyflow/react + dagre |
| Archives | JSZip |
| Deploy | GitHub Actions → GitHub Pages (web) and tagged releases (desktop) |

---

## Getting started

```bash
npm install
npm run dev          # web dev server at http://localhost:5173/map-editor-json-tool/
npm run build        # production build into dist/ — the project's quality gate

npm run tauri:dev    # run the desktop app against the dev server
npm run tauri:build  # package the desktop app
```

`npm run build` runs `tsc -b` first, so it is what to check before committing. There is no
test suite; behavioural checks are done against the real game data in `Core/` and the `.map`
files in `maps/` (neither is committed).

Desktop-only features are gated behind `isTauri()` (`src/lib/native-fs.ts`), and every Tauri
API is reached through a dynamic import inside that guard — never imported at module top
level, so the web build stays clean.

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
│   ├── scenario.ts            — Interfaces for the scenario JSON format
│   ├── dialog.ts              — Dialog flows (DialogFlow, DialogSlide, DialogAnswer, avatars)
│   └── map-context.ts         — Read-only data derived from a loaded .map file
├── schema/
│   ├── conditions.ts          — Registry of known condition types + parameters
│   ├── actions.ts             — Registry of known action types + parameters
│   ├── entities.ts            — Built-in entity fallback lists
│   └── zod.ts                 — Permissive Zod schemas (failures become warnings, not errors)
├── store/                     — Zustand: scenario (with undo), catalog, map context, guides, theme
├── lib/
│   ├── catalog/
│   │   ├── types.ts           — GameCatalog and per-entity interfaces
│   │   ├── zip-loader.ts      — Core.zip discovery (Steam paths, resource dir, file picker)
│   │   ├── builder.ts         — Catalog extraction from Core.zip (heroes, spells, dialogs, …)
│   │   ├── static-catalog.ts  — Bundled fallback catalog for when Core.zip isn't loaded
│   │   ├── icon-requests.ts   — Which icons the extractor should fetch (incl. hero portraits)
│   │   └── thumbnails.tsx     — thumbnailPath, CatalogIcon, PortraitThumb, heroPortraitPath
│   ├── import.ts / export.ts  — Project JSON round-trip, including the _* editor keys
│   ├── dialog-file.ts         — The shipped per-dialog file shape ({"array":[flow]})
│   ├── json-docs.ts           — Documents shown in the editable JSON column
│   ├── zip-export.ts          — Builds the distributable map ZIP
│   ├── publish.ts             — Resolves the two publish destinations
│   ├── languages.ts           — The game's 16 languages + English-fallback resolution
│   ├── factions.ts            — Faction display names and the game's faction order
│   ├── validate.ts            — Scenario, dialog-flow and localisation checks
│   ├── map-parser.ts          — .map binary reader (gzip + LEB128-framed JSON blocks)
│   ├── map-extract.ts         — Derives MapContext (entities, spawns, placements) from blocks
│   ├── map-file.ts            — Opens a .map plus its sidecar scenario JSON
│   ├── timeline.ts / quest-flow.ts — Derived views for the timeline and DAG
│   ├── native-fs.ts           — The only place Tauri file APIs are touched; isTauri() guard
│   ├── updater.ts             — Auto-update checks and install
│   ├── session-handoff.ts     — Saves and restores the open project across an update restart
│   ├── dialog-geometry.ts     — Remembered size/position for resizable modals
│   └── panel-sync.ts          — BroadcastChannel state mirror for undocked panel windows
└── components/
    ├── layout/                — AppShell, Toolbar, MapMetaForm
    ├── tree/                  — Sidebar scenario tree (incl. the Entity SIDs section)
    ├── editors/               — Counter, Interruption, Quest, SubQuest, Trigger editors
    ├── conditions/ actions/   — Condition and action forms and lists
    ├── dialogs/               — DialogEditor, LocalizationDialog, AvatarStrip, AssetCombobox
    ├── catalog/               — GameDatabaseDialog, HeroPickerDialog, DialogBrowser, filters
    ├── guides/                — GuidesDialog, GuideArticle, TemplatePicker, AnnotationBanner
    ├── panels/                — Undocked panel windows (PanelShell, PanelContent)
    └── common/                — JsonPreview, DraggableDialogContent, Publish/Update/Setup/
                                 Theme/Thumbnail dialogs, CommandPalette, Timeline, QuestFlow, Stats

src-tauri/
├── src/lib.rs                 — Tauri setup: menu bar, updater, extract_thumbnails command
└── sidecar/                   — Python + UnityPy icon extractor (built by scripts/build-sidecar.sh)
```

Content authoring — guide articles, tooltips and templates — is documented separately in
[CONTENT.md](CONTENT.md).

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

When saved via this editor, the file also includes editor-only metadata keys — `_mapName`,
`_dialogs`, `_localization` and `_translations` (added only when you add a second language).
These round-trip correctly on re-import and are silently ignored by the game engine.
**Export ZIP** and **Publish** strip them, so what the game loads is exactly the format above.

---

## Releasing (maintainers)

Desktop builds are produced by `.github/workflows/tauri-build.yml` on a `v*` tag.

### One-time updater setup

Auto-update artifacts are signed with a minisign keypair. **Until this is done, releases
still build and ship normally — they just carry no auto-update support**, and the workflow
logs a warning saying so. `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` is empty
and `bundle.createUpdaterArtifacts` is `false`; the release workflow flips it on
per-platform once the signing secret exists.

```bash
npm run tauri signer generate -- -w ~/.tauri/oe-editor.key
```

1. Paste the **public** key into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`.
2. Add the **private** key as the repository secret `TAURI_SIGNING_PRIVATE_KEY`.
3. Add its password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (create it empty if you set no
   password).

Keep the private key backed up outside the repo. **If it is lost, no already-installed copy
of the app can ever be updated again** — every user would have to reinstall by hand.
`.gitignore` blocks `*.key` so a stray copy in the working tree can't be committed.

### Cutting a release

1. Tag and push: `git tag v0.6.9 && git push origin v0.6.9` (the workflow takes the version
   from the tag and syncs `tauri.conf.json` and the download links above).
2. The workflow builds all three platforms and opens a **draft** release.
3. Check the draft, then **publish** it. The updater endpoint reads
   `releases/latest/download/latest.json`, which only resolves for published releases — so
   nothing reaches users until you publish. That gate is deliberate.

Updates cover **macOS (Apple Silicon) and Windows**. The Linux job deliberately produces no
updater artifacts: AppImage self-update requires the AppImage to be writable in place, and
deb/rpm installs can never self-update, so Linux users keep downloading manually.

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
