# HoMM Olden Era — Scenario Script Editor

A visual editor for the scenario scripting JSON files used in **Heroes of Might and Magic: Olden Era** (by Unfrozen). Runs in the browser or as a native desktop app on macOS, Windows, and Linux.

**Web app:** https://mimiasei.github.io/map-editor-json-tool/

**Desktop downloads (v0.8.10):**

| Platform | Download |
|---|---|
| macOS — Apple Silicon | [HommOE.Scenario.Editor_0.8.10_aarch64.dmg](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.8.10/HommOE.Scenario.Editor_0.8.10_aarch64.dmg) |
| Windows | [HommOE.Scenario.Editor_0.8.10_x64-setup.exe](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.8.10/HommOE.Scenario.Editor_0.8.10_x64-setup.exe) |
| Linux | [HommOE.Scenario.Editor_0.8.10_amd64.AppImage](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.8.10/HommOE.Scenario.Editor_0.8.10_amd64.AppImage) |

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
- **Edit the map itself** (desktop) — open the binary `.map` file and use the Map Grid to move, add, delete, rotate, and paint objects and terrain directly. Good for quick changes.
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

**Map Grid** (desktop) — Introducing a 2D alternative to the HoMM:Olden Era map editor - a live view of your actual map, not just the script, with two modes:
- **Browse** — click any tile to inspect everything placed on it, safe to poke around without changing anything.
- **Paint** — every edit is staged locally until you explicitly save (Ctrl+Z undoes staged edits before you do):
  - **Objects** — move, add, delete, and rotate; place real creature squads (not just decorative wildlife) with hover tooltips for stats; assign which player starts where — city or hero.
  - **Terrain & water** — drag-paint terrain, roads, rivers, and ramps; flood-fill water into lowered terrain; a blocked-tile overlay shows exactly what's walkable; erase anything with the Eraser tool.
  - **Scatter brushes** — **Obstacles**, **Trees**, and **Landmarks** drop biome-appropriate scenery as you drag. Each has its own settings popover: mountain/pool chance (Obstacles), how much cross-biome mixing to allow (all three), and a switch for whether jarring "high-contrast" biome mixes are allowed at all (like palm trees on snow).

**Dialog & localization** — a visual slide editor for branching NPC conversations: portraits, animations, voice lines, player choices, and per-slide map actions. Translate every dialog and quest name into any of the game's 16 languages side by side, with English as a safety-net fallback.

**Scenario scripting** — full CRUD across counters → interruptions → quests → sub-quests → triggers → conditions/actions, with 55 condition types and 114 action types, labelled fields and inline tooltips, plus a forward-compatible fallback for anything the registry doesn't know yet.

**Custom content** — build your own heroes, map objects, artifacts, and buffs, either from scratch or by cloning something that already exists.

**Game Data Catalog** — load your game's `Core.zip` to populate every dropdown with real names and artwork, and browse the full Hero / Creature / Artifact / Object database and every one of the game's ~769 shipped dialogs.

**Quality of life** — undo/redo, a command palette (Ctrl+K), SID autocomplete, live JSON preview, an event timeline and quest-flow diagram, resizable/movable/undockable panels, and built-in guides with annotated starter templates.

**Ship it** — export a distributable map ZIP, or (desktop) **Publish** straight into your game install in one click. Auto-update keeps the desktop app itself current.

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
│   ├── map-write.ts / map-save.ts — Span-patch-and-splice .map edits, verified before write
│   ├── map-grid/               — Footprint, passability and cell-visual helpers for the Map Grid
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
    ├── map-grid/               — MapGridDialog, ObjectBrowserPanel, cell-info column (desktop)
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
