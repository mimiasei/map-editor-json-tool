# HoMM Olden Era — Scenario Script Editor

A visual editor for the scenario scripting JSON files used in **Heroes of Might and Magic: Olden Era** (by Unfrozen). Runs in the browser or as a native desktop app on macOS, Windows, and Linux.

**Web app:** https://mimiasei.github.io/map-editor-json-tool/

**Desktop downloads (v0.9.11):**

| Platform | Download |
|---|---|
| macOS — Apple Silicon | [HommOE.Scenario.Editor_0.9.11_aarch64.dmg](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.9.11/HommOE.Scenario.Editor_0.9.11_aarch64.dmg) |
| Windows | [HommOE.Scenario.Editor_0.9.11_x64-setup.exe](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.9.11/HommOE.Scenario.Editor_0.9.11_x64-setup.exe) |
| Linux | [HommOE.Scenario.Editor_0.9.11_amd64.AppImage](https://github.com/mimiasei/map-editor-json-tool/releases/download/v0.9.11/HommOE.Scenario.Editor_0.9.11_amd64.AppImage) |

> **macOS note:** the app is not notarized by Apple. Gatekeeper will block it — especially on Apple Silicon. The reliable workaround is to run this once in Terminal after copying the app to `/Applications`:
> ```
> xattr -dr com.apple.quarantine "/Applications/HommOE Scenario Editor.app"
> ```
> Then open it normally. "Open Anyway" in System Settings is not sufficient on Apple Silicon.

---

## What it does

The in-game map editor does not expose scenario scripting. Quest flow, win/lose conditions, story dialogs, hero buffs, difficulty scaling, and all other event-driven behaviour are controlled through a `.json` file that map creators currently hand-edit through trial and error.

This tool gives that file a visual interface, and a lot more:

- **Generate** a complete random map in one click, from the editor or from the game's own map editor
- **Edit the map itself** (desktop): open the binary `.map` and move, add, delete and paint objects and terrain in the Map Grid
- **Script** quests, counters, triggers, conditions and actions as forms or plain-language cards
- **Author dialogs and localise** them into any of the game's 16 languages
- **Export** a scenario JSON or a distributable map ZIP, or **Publish** straight into the game

It is a companion to the map editor, not a replacement for it.

---

## How to ship a custom map

1. **Build your map** in the game's built-in map editor. It saves a binary map file somewhere on disk.

2. **Write the script** in this tool. Use **Save As** to save the `.json` file **in the same folder as the binary map file**. The game runs the quests embedded in the `.map` (Save and Publish write them there); the `.json` is this tool's own copy.

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

Ranked from the biggest to the smallest. Items marked *(desktop)* need the desktop app.

1. **Map Grid** *(desktop)*: a live 2D view of your real `.map`.
   - **Browse**: click a tile to inspect everything on it; a blocked-tile overlay shows what is walkable and follows the filter pills.
   - **Paint**: terrain, roads, rivers, ramps and water; objects, heroes, creature squads and player starts (city or hero); scatter brushes for obstacles, trees and landmarks; an Eraser. Edits apply at once, with their own undo/redo (Ctrl+Z).
   - **Bulk tools**: select, copy, paste and delete groups of objects; **Scale encounters** raises or lowers many creature squads by a percentage, picked by difficulty, with a before/after preview.
   - **Details**: set a city's starting hero from the hero browser (or leave it random), resize zones from a dropdown, and click any object in the info column to centre on it at 100% zoom.
2. **Map Fairness** *(desktop)*: scores how even the player areas are (land, mines, terrain, sites) and flags the gaps. It can **paint player areas** for the cities already on a map, using the generator's own layout, and **Rebalance**: a report of suggested fixes (grow or shrink an area, add resource sites) with tick boxes, applied as one undo step.
3. **Random map generator**: a playable, fair map from a few choices (size, players, richness, complexity, difficulty, water) or a seed. Advanced mode adds water and islands, hills, zone shape, object and guard density, roads and portals. Classic mode follows the game's own maps: zone layouts, winding rivers with waterfalls, roads to every city, guards on entrances, game-like mine economy. A map scoring low on player balance is re-rolled, and a seed reproduces the same map. On Windows, the optional **game map editor mod** adds these options to the game editor's *Generate map* dialog (see [gme-mod/README.md](gme-mod/README.md)).
4. **Scenario scripting**: counters, interruptions, quests, sub-quests and triggers, with 55 condition types and 114 action types. Start a rule from a map object and its fields fill in. Forms with tooltips, or a **Card view** that reads as plain sentences with clickable links to heroes, objects, dialogs and map tiles.
5. **Dialogs and localisation**: a slide editor for branching NPC conversations (portraits, animations, voice lines, choices, per-slide map actions). Translate dialogs and quest names side by side, with English as the fallback.
6. **Story Builder**: add a whole story in a few clicks from ready-made stories, steps you stack yourself, or (desktop, optional) your own idea. It generates normal connected quests, choice counters and dialogs. An optional free Gemini or Groq key writes text that fits your story and map; without one, built-in text is used.
7. **Import Heroes III maps** *(desktop)*: *More → Import H3 Map* converts a `.h3m` (terrain, scenery, towns, heroes, monsters, mines, dwellings, artifacts, portals, victory quest) into an Olden Era map to polish in the Map Grid.
8. **Publish and ship**: export a distributable map ZIP, or **Publish** into your game install in one click *(desktop)*, with a reminder after Save when the game still lacks your map's ZIP. The desktop app updates itself.
9. **Game data catalog and Game Database**: load `Core.zip` for real names and artwork in every dropdown, and browse heroes, creatures, artifacts, rendered map objects (with filters) and all ~769 shipped dialogs.
10. **Image to map** *(desktop)*: turn a picture into terrain and per-biome decorations through a colour mapping.
11. **Custom content**: your own heroes, map objects, artifacts and buffs, from scratch or by cloning.
12. **Game skin and themes**: an optional look that follows the game's own menus *(desktop)*, plus a Theme editor and 7 UI languages.
13. **Quality of life**: undo/redo, command palette (Ctrl+K), SID autocomplete, live JSON preview, event timeline and quest-flow diagram, undockable panels, and built-in guides with starter templates.

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

On Windows, run `scripts\prepare-gme-mod.ps1` once before `npm run tauri:build`: the installer
bundles the game map editor mod and BepInEx (see [gme-mod/README.md](gme-mod/README.md)), and
the build fails without them. The installer also finds the game folder (Steam libraries) or asks
for it, so the editor loads `Core.zip` on first start without manual setup.

<details>
<summary><b>Tuning the Classic random map generator</b></summary>

Classic-mode values can be overridden without rebuilding, in an optional
`rmg-tuning.json` in the app data folder (Windows: `%APPDATA%\com.oe.map-editor\`). It is read on
every generation — in the editor and from the game map editor mod. Next to it,
`rmg-tuning.defaults.json` is rewritten on each generation with every current value; copy the ones
to change into `rmg-tuning.json` (all keys optional, `_`-keys are comments). It covers complexity
scales, richness pools/tiers, water chances, elevation (valley chance, minimum hill width, zone
layouts), how often each zone layout is picked (ring, ring with center, inner ring, double neutral,
pockets, hub), how many mines of which types neutral and player zones get, the difficulty levels' guard values, and the chance of a guard per object category (mines,
dwellings, resources, interactables by rarity, artifacts, treasure, random cities) or per object sid, how often a neutral zone gets a lone guard
away from any object, how many rivers there are, how much they wind, and how far they keep from cliffs (`rivers.cliffClearance`, so no row of waterfalls under a cliff), how wide they get toward the mouth (`rivers.mouthWidening`), how often a river flows into another one (`rivers.confluenceChance`), and how much clutter lines the banks (`rivers.bankDecoration`). `edges.frame` (0-1, default 1) sets how densely trees and mountains fence in the map edge, as on the game's own maps (0 = bare edge). `interactables.weightBySid` sets how likely a single interactable is to be scattered (0 never); by default the game's own content-list weights are used, and objects the game never rolls (weight 0, e.g. `mirage`, `insaras_eye`) plus the rare tier are left out. Sand, Snow and Lava never mix with other biomes: their seams stay hard, their objects and animals only stand on their own ground, other biomes' objects stay off them (the Grass pines and fish go anywhere), and a beach is only added to water whose whole shore is Grass, Dirt, Autumn or Sand.
Invalid entries are skipped and listed in the app log. Shape and rules: `src/lib/rmg/rmg-tuning.ts`.

</details>

Desktop-only features are gated behind `isTauri()` (`src/lib/native-fs.ts`), and every Tauri
API is reached through a dynamic import inside that guard — never imported at module top
level, so the web build stays clean.

---

## Example files

The `examples/` directory contains scenario JSON files (`example_01.json` – `example_08.json`) that can be imported directly into the tool. Provided for reference/testing only and remain property of Unfrozen.

---

## Project structure

```
src/
├── types/ schema/ store/      — scenario types, condition/action registries and Zod schemas, Zustand stores
├── lib/                       — .map parser/writer, catalog loader, export/publish, and the feature engines:
│   ├── rmg/                     random map generator
│   ├── stories/                 Story Builder
│   ├── map-grid/                footprint and passability helpers
│   └── native-fs.ts             the only place Tauri file APIs are touched (isTauri() guard)
├── components/                — editors, dialogs, catalog, guides, story, map-grid (desktop), common
└── locales/                   — UI translations (7 languages)

gme-mod/                       — BepInEx plugin for the game's map editor (see gme-mod/README.md)
src-tauri/                     — Tauri (Rust): updater, headless --generate, text writer, Python/UnityPy sidecar
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

Contributions are welcome. Good first ones: adding missing condition/action types to
`src/schema/conditions.ts` / `src/schema/actions.ts`, bug fixes, and UX improvements.

1. **Open an issue first** describing the feature or bug, so work stays visible and avoids duplication.
2. Fork the repo and create a feature branch off `main`: `git checkout -b feature/my-feature`
3. Commit your changes with a clear message
4. Push the branch and open a pull request that references the issue (e.g. `Closes #42`)

Keep PRs focused — one feature or fix per PR. If you've found a condition/action type in a
scenario file not yet covered by the registry, an issue with the type name and a `p[]` example
is extremely helpful.
