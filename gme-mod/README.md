# Map editor (GME) mod

A BepInEx 6 (IL2CPP) plugin for Heroes of Might and Magic: Olden Era's own map
editor. It adds **Seed (random or the seed field; the seed field only counts when `cli.useSeed` is true in the tse tuning file), Players, Richness, Complexity, Difficulty and Water** options
to the editor's *Generate map* dialog, plus **Layout** (`--layout`) below them, and a second column with **Starting towns** (fit the terrain, or random; `--faction`) and an Off/On dropdown for each extra **win condition**
(Capital Hold, City Hold, Guardian's Demise, Final Battle, Tournament; sent as `--win classic,…`, with the default days
and battle dates) **Mirrored Map** (`--mirror true`, even player counts only: the right half copies the left) and **Max Heroes** (1-10 heroes per player, default 10; `--max-heroes`, written to the map's `heroCountMax`), and generates the map with the Scenario
Editor's random map generator (`app.exe --generate …`, see
`src/lib/rmg/headless-args.ts`), then opens the result in the map editor.

## Staying in the game while generating

A second window in front of a fullscreen game makes Windows drop the game to the
desktop, and over exclusive fullscreen nothing can be drawn on top at all. So the
mod runs `app.exe --generate … --progress <file>`, which shows **no window**: the
game keeps running, the dialog's template label shows `Generating map… NN %`
(read from the progress file), and when the Scenario Editor exits the map opens
and the game window is brought back to the front if anything took the focus.
The BepInEx log records the display mode (`Screen.fullScreenMode`) and whether the
game was in front before and after. If the per-frame hook (`EventSystem.Update`)
can't be patched, the mod falls back to the old behaviour: wait on the game
thread, with the Scenario Editor's own window (topmost, focused) shown.

## Installing

The Windows installer (`…-setup.exe`) offers the mod during setup. On **Yes** it:

- installs BepInEx into the game folder if it isn't there yet (the first game
  start afterwards takes a few minutes while BepInEx prepares itself);
- copies `GmeRmgMod.dll` to `<game>\BepInEx\plugins\`;
- writes `<game>\BepInEx\config\com.mimiasei.oldenera.externalrmg.cfg` with the
  path of the installed Scenario Editor (`TseExecutable`).

Auto-updates refresh the mod without asking; uninstalling the Scenario Editor
removes the mod (BepInEx stays). The MSI installer doesn't include the mod.

## Building

```powershell
scripts\prepare-gme-mod.ps1   # builds the mod + fetches BepInEx into src-tauri\gme-mod\
npm run tauri:build           # bundles them into the Windows installer
```

The mod compiles against the BepInEx NuGet packages only — no game files.
Every game and Unity type is looked up by name at runtime in `GameApi.cs`.
The BepInEx version is pinned in two places that must match: the
`PackageReference` in `GmeRmgMod.csproj` and `$BepInExBuild`/`$BepInExFile`/
`$BepInExSha256` in `scripts/prepare-gme-mod.ps1`.

## After a game update

The game's code is obfuscated and some names the mod uses change with game updates
(last known: `qu`, `bvns`, `bvod`/`bvoe`, `bzyv`, `bzyx`, `bzyy`). The mod no longer depends on them:
if a name is gone it finds the member by its shape instead and says so in
`BepInEx\LogOutput.log`.

- Map size list: the `List<T>` property of `BhNewGenMap` where `T` has two int properties.
- File index: a `Dictionary<string, T>` on a class with a static property of its own type, where `T`
  is accepted by `BhMapEditor.Load`. Searched once, only when the remembered names are gone.

If the game changes in a way those rules don't cover, the mod disables itself and the log lists each
name it couldn't find (`Game API not found: …`). Then update the constants at the top of `GameApi.cs`;
the generated interop assemblies in `<game>\BepInEx\interop` (e.g. inspected with dnSpy) show the new names.
