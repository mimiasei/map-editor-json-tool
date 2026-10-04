# Map editor (GME) mod

A BepInEx 6 (IL2CPP) plugin for Heroes of Might and Magic: Olden Era's own map
editor. It adds **Players, Richness, Complexity, Difficulty and Water** options
to the editor's *Generate map* dialog and generates the map with the Scenario
Editor's random map generator (`app.exe --generate …`, see
`src/lib/rmg/headless-args.ts`), then opens the result in the map editor.

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

The game's code is obfuscated, and some names the mod uses (`qp`, `bufc`,
`bufo`, `byok`, `byom`, `byon`) change with game updates. When they do, the
mod disables itself and `BepInEx\LogOutput.log` lists each name it couldn't
find (`Game API not found: …`). Update the constants at the top of
`GameApi.cs`; the generated interop assemblies in `<game>\BepInEx\interop`
(e.g. inspected with dnSpy) show the new names.
