# CLAUDE.md

## Git: always commit finished work, never push or open PRs on your own

- **Always** commit when you finish a task (once it typechecks/builds and is verified as far as possible).
  One commit per finished task; don't commit half-done work.
- **Never** run `git push`, create/update a pull request (`gh pr create` etc.), or merge unless the user
  explicitly tells you to in that message ("push it", "create the PR", ...).
- When on `main` (or another branch whose PR is already merged), first create a new feature branch for the
  work and commit there — never commit new work directly on `main`.
- Only stage the files that belong to the task; leave unrelated changes (e.g. sidecar binaries, `Cargo.toml`
  tweaks) uncommitted.

## How the game loads custom maps (verified in-game, Oct 2026)

Found by bisecting a map whose quests never ran; each point was confirmed by a test in the game.

### Quests live in the `.map`, not the `.json`
- The game runs a map's quests from **Block 4** inside the `.map`. The sidecar `.json` is only this editor's
  own copy; quests added to the `.json` alone do nothing in the game.
- Block 4 is read only when the header flag is set: bit `0x08` of the first of the 2 bytes after the version
  string. Every shipped map with scripts has `0d 00` (4 blocks); every 3-block map has `05 00`.
- `embedScenarioInContainer` (`src/lib/map-write.ts`) writes counters/interruptions/quests into Block 4 and sets
  the flag. Save (`commitToDisk`) and Publish (`PublishDialog`) call it through `writeMapChunks`. Any new code
  path that writes a `.map` must do the same, or published quests silently never trigger.
- Quests may be minimal (`sid`, `activeOnStart`, `sharing`, `subQuests` with `triggers`); the extra fields in
  shipped files (`comment`, `main`, `name`, `desc`, `subQuestGroups`) are not required, and neither is `hidden`.

### Zip files in StreamingAssets (from an Unfrozen developer)
- The game loads **every `.zip` in the folder where `Core.zip` lives as an addon to `Core.zip`**.
- The zip file's **name is irrelevant**. What matters is the **folder structure** (must be identical to
  `Core.zip`'s, e.g. `DB/dialogs/dialogs/custom_maps/<Map>/<id>.json`, `Lang/<language>/texts/<file>.json`) and
  the **sids** (dialog ids, text tokens).
- Sids must be **unique across Core.zip and every other zip**: a repeated sid in an addon zip overwrites the one
  in `Core.zip` (or in another zip). Two of our maps both using e.g. `welcome_dialog` overwrite each other.
  Keep dialog ids and text tokens unique per map (prefix them with the map name). Not yet enforced by the tool.
- Dialogs resolve through that global pool, not through the map: a dialog from `demoquestmap.zip` also showed in
  a different map. Gold-only actions work without any zip.
- Steam updates/branch switches can remove zips from StreamingAssets; republish to restore them.

### Map identity
- Two `.map` files with the **same header hash** (the 32-hex string in the header, duplicated as Block 1's
  `hashSum`) confuse the game: it can load the other copy. A copied map needs a fresh hash in both places.
- A map whose `title` equals another listed map's title is hidden from the map list (e.g. a copy of a shipped
  map keeps its `scenario_1_name` title). A `.json` never affects whether a map is listed.
- File name, `fileMapName`, map version (`0.72.30` / `0.80.34` / `0.80.47`) and the `.map`'s folder
  (`my_maps` or `StreamingAssets\maps`) made no difference to whether quests run.
- Test copies of a shipped map need a new hash, a new title and a new file name.

### Things that did NOT matter (ruled out)
Trailing blank `""` parameters, `hidden`/`name` on quests, `isScenario`, `endController`, `isTournamentRules`,
the beta vs. main Steam branch, BepInEx / the GME mod, map terrain/objects/areas/spawns data.

### Blank parameters and conditions (fixed on export)
- The editor fills every parameter slot with `""`, and a half-added condition can stay empty. `cleanScenarioForGame`
  (`src/lib/scenario-clean.ts`) runs on JSON export and on the Block 4 embed: it drops trailing blank values after the
  last required param (shipped files never have `Dialog ["id",""]`), and removes empty conditions such as
  `ObjectCaptureEntity [""]` when other conditions remain (a lone empty condition is kept so the trigger never fires
  instead of firing every tick). Unknown/custom types are left alone. The scenario in the editor is not changed.

### How to bisect "my quests don't run"
Copy a map known to work, give the copy a new hash/title/file name, and swap one group of the failing map's
data at a time (header flag, Block 1, Block 2 groups, Block 4) until it breaks. Keep only one copy per hash in
the game's folders while testing.

## Story Builder and the text writer (not yet tested in the game)

- `src/lib/stories/` generates stories as plain quests, counters, dialogs and tokens. Every sid starts with
  `{mapSnake}_{story}_` and is minted by `createStoryNamer` (`namer.ts`), which also avoids collisions with the
  project. Never let generated text or the text service choose sids.
- Story state is integer counters. `validateStoryState` (`src/lib/story-validate.ts`, run by `validateScenario`)
  flags counters that are changed but never checked or the reverse, and dialog ids without the map prefix.
- Two behaviours are **assumptions, not verified in-game**: chained quests start on the next turn start
  (`StartTurn` with no params), and a finale gives victory through `closeMapActions: GameVictory` on the last dialog slide.
  Confirm in the game before relying on them, then update this note.
- The text writer lives in `src-tauri/src/text_writer/`. Prompts exist only there, are built from fixed vocabularies
  plus sanitized names, and replies are validated before they reach the UI. The user's key is kept in the OS
  credential store and never leaves Rust. Do not move prompts or key handling into the frontend, and do not add a
  free-text prompt box. English is always the base language of generated text.
- Without a key (or on the web build) everything works from the built-in phrase banks in `src/lib/stories/phrases.ts`.

- Verified in-game: a dialog's first slide must have the id `start`, or the game logs
  "dont have slide start" and shows a blank dialog. Story dialogs use `start` for their first slide.
