// ─── GME random map generator mod ────────────────────────────────────────────
// Adds Players / Richness / Complexity / Difficulty / Water / Layout / Win
// condition / Starting towns dropdowns to the
// game map editor's (GME) "Generate map" dialog and replaces its generator with
// the Scenario Editor's (tse) headless RMG: the dialog runs
// `app.exe --generate …`, then opens the generated map in GME.
//
// Built without the game's interop assemblies — all game/Unity access goes
// through GameApi (looked up by name at runtime).

using System;
using System.Diagnostics;
using System.IO;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;

namespace GmeRmgMod
{
    [BepInPlugin(PluginGuid, "Scenario Editor RMG for the map editor", "1.1.0")]
    public class Plugin : BasePlugin
    {
        public const string PluginGuid = "com.mimiasei.oldenera.externalrmg";
        /// <summary>The generated map, in the user's my_maps folder.</summary>
        private const string OutputFileName = "external_rmg_output.map";

        internal static ManualLogSource Logger;
        private static ConfigEntry<string> tseExecutable;

        // The added dropdowns (TMP_Dropdown), set by StartPostfix.
        private static object seedDropdown, playersDropdown, richnessDropdown, complexityDropdown, difficultyDropdown, waterDropdown;
        private static object layoutDropdown, townsDropdown, mirrorDropdown;

        // Layout names as tse's --layout takes them; index 0 (Random) sends no flag.
        private static readonly string[] LayoutArgs = { "", "ring", "ringCenter", "innerRing", "doubleNeutral", "pockets", "hub" };

        // What each layout looks like, shown under the Layout dropdown (index as LayoutArgs; Random has none).
        // Keep in step with LAYOUT_LABELS in src/lib/rmg/zone-archetypes.ts.
        private static readonly string[] LayoutTexts =
        {
            "",
            "One ring: player and neutral zones alternate, and each zone touches only its two neighbours.",
            "Like Ring, plus a rich treasure zone in the middle that every neutral zone connects to, for shortcuts across the map.",
            "Players on the outside, neutral zones in their own ring in the middle. Each player connects to the two nearest inner zones, never to other players. Up to 7 players.",
            "A ring with two neutral zones between each pair of neighbouring players, so rivals are further apart. Up to 4 players.",
            "A tight ring of players and neutral zones, with a dead-end treasure pocket behind each neutral zone. Up to 4 players.",
            "Each player has one neutral zone leading to a rich central zone. No ring between players. Up to 4 players.",
        };
        private static object layoutText;
        private static int shownLayout = -1;

        // The win conditions on top of Classic, each its own Off/On dropdown: (tse --win id, label).
        private static readonly (string id, string label)[] WinChoices =
        {
            ("capital-hold", "Capital Hold"),
            ("city-hold", "City Hold"),
            ("guardians-demise", "Guardian's Demise"),
            ("final-battle", "Final Battle"),
            ("tournament", "Tournament"),
        };
        private static readonly object[] winDropdowns = new object[WinChoices.Length];

        /// <summary>Height added to the dialog frame: the left column's 7 added rows of 35px (seed to layout), the 50px layout description and margin.</summary>
        private const float ExtraHeight = 7 * 35f + 60f + 50f;

        /// <summary>Width of the second column of dropdowns (300px wide plus a 20px gap), also added to the frame.</summary>
        private const float ColumnWidth = 320f;

        /// <summary>The game reads maps from users/&lt;last_user&gt;/my_maps (created if missing).</summary>
        private static string MapsDirectory()
        {
            string dataPath = GameApi.PersistentDataPath;
            string mapsDir = Path.Combine(dataPath, "my_maps");
            string lastUserFile = Path.Combine(dataPath, "last_user.txt");
            if (File.Exists(lastUserFile))
            {
                string userFolder = File.ReadAllText(lastUserFile).Trim();
                if (!string.IsNullOrEmpty(userFolder)) mapsDir = Path.Combine(dataPath, "users", userFolder, "my_maps");
            }
            Directory.CreateDirectory(mapsDir);
            return mapsDir;
        }

        /// <summary>The game indexes the my_maps folder once, at startup, so a map generated later can only be opened if a
        /// file of that name already existed then. A blank map as placeholder (replaced by the first generated map) makes sure it does.</summary>
        private static void EnsureOutputFileExists()
        {
            try
            {
                string path = Path.Combine(MapsDirectory(), OutputFileName);
                if (File.Exists(path) && new FileInfo(path).Length > 0) return;
                using (var resource = typeof(Plugin).Assembly.GetManifestResourceStream("placeholder.map"))
                {
                    if (resource == null) { Logger.LogWarning("The placeholder map is missing from the mod"); return; }
                    using (var file = File.Create(path)) resource.CopyTo(file);
                }
                Logger.LogInfo($"Created a placeholder {OutputFileName} so the game indexes it at startup");
            }
            catch (Exception ex) { Logger.LogWarning($"Could not create the placeholder map: {ex.Message}"); }
        }

        public override void Load()
        {
            Logger = Log;
            tseExecutable = Config.Bind("Paths", "TseExecutable", "",
                "Full path of the Scenario Editor's app.exe. Leave empty to use the path the Scenario Editor installer recorded.");

            if (!GameApi.Resolve(Log))
            {
                Log.LogError("The game changed in a way this mod doesn't know yet — mod disabled. Update the Scenario Editor, or the names in GameApi.cs.");
                return;
            }

            EnsureOutputFileExists();

            var harmony = new Harmony(PluginGuid);
            harmony.Patch(GameApi.NewGenMapStart, postfix: new HarmonyMethod(typeof(Plugin), nameof(StartPostfix)));
            harmony.Patch(GameApi.NewGenMapOnBtn, prefix: new HarmonyMethod(typeof(Plugin), nameof(OnBtnPrefix)));
            if (GameApi.PerFrameMethod != null)
            {
                try
                {
                    harmony.Patch(GameApi.PerFrameMethod, postfix: new HarmonyMethod(typeof(Plugin), nameof(TickPostfix)));
                    backgroundGeneration = true;
                }
                catch (Exception ex) { Log.LogWarning($"Per-frame hook failed ({ex.Message})."); }
            }
            if (!backgroundGeneration) Log.LogWarning("No per-frame hook: generating blocks the game and the Scenario Editor shows its own window (it may take the focus from a fullscreen game).");
            Log.LogInfo($"Map editor RMG mod active (Scenario Editor: {FindTse() ?? "not found"})");
        }

        /// <summary>The Scenario Editor's app.exe: this mod's config entry if set and
        /// present, else the path its installer recorded in the registry, else the
        /// default per-user install folder. Null when none exists.</summary>
        private static string FindTse()
        {
            string configured = tseExecutable.Value?.Trim();
            if (!string.IsNullOrEmpty(configured))
            {
                if (File.Exists(configured)) return configured;
                Logger.LogWarning($"TseExecutable \"{configured}\" (BepInEx/config/{PluginGuid}.cfg) doesn't exist — using the installed Scenario Editor instead");
            }
            if (OperatingSystem.IsWindows())
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\oe\HommOE Scenario Editor");
                if (key?.GetValue("TseExecutable") is string installed && File.Exists(installed)) return installed;
            }
            string fallback = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HommOE Scenario Editor", "app.exe");
            return File.Exists(fallback) ? fallback : null;
        }

        // ── Dialog: add the dropdowns ───────────────────────────────────────

        public static void StartPostfix(object __instance)
        {
            try { AddDropdowns(__instance); }
            catch (Exception ex) { Logger.LogError($"Adding the generator dropdowns failed: {ex}"); }
        }

        private static void AddDropdowns(object newGenMap)
        {
            dynamic dialog = GameApi.Cast(newGenMap, GameApi.NewGenMap);
            dynamic sizeDropdown = dialog.dropdown;
            if (sizeDropdown == null) return;

            dynamic parent = sizeDropdown.transform.parent;
            dynamic sizeRect = GameApi.GetComponent(sizeDropdown, GameApi.RectTransform);
            float baseY = (float)sizeRect.anchoredPosition.y - 40f;
            dynamic templateRect = GameApi.GetComponent(dialog.template, GameApi.RectTransform);
            float leftX = (float)templateRect.anchoredPosition.x + 35f;

            // First: whether tse rolls its own seed (default) or uses the game's seed field.
            seedDropdown = AddDropdown(sizeDropdown, parent, "Seed_Dropdown", leftX, baseY - 35f,
                new[] { "Random Seed", "Use Seed Field" }, 0);
            playersDropdown = AddDropdown(sizeDropdown, parent, "Players_Dropdown", leftX, baseY - 70f,
                new[] { "2 Players", "3 Players", "4 Players", "5 Players", "6 Players", "7 Players", "8 Players" }, 2);
            richnessDropdown = AddDropdown(sizeDropdown, parent, "Richness_Dropdown", leftX, baseY - 105f,
                new[] { "Poor Economy", "Modest Loot", "Medium Richness", "Rich Map", "Very Rich Map" }, 2);
            complexityDropdown = AddDropdown(sizeDropdown, parent, "Complexity_Dropdown", leftX, baseY - 140f,
                new[] { "Sparse Layout", "Light Objects", "Medium Complexity", "Dense Map", "Very Dense Map" }, 2);
            // The game's six lobby difficulty levels (tse --difficulty 0-5), default Normal
            difficultyDropdown = AddDropdown(sizeDropdown, parent, "Difficulty_Dropdown", leftX, baseY - 175f,
                new[] { "Easy Guards", "Normal Guards", "Hard Guards", "Impossible Guards", "Deadly Guards", "Hell Guards" }, 1);
            waterDropdown = AddDropdown(sizeDropdown, parent, "Water_Dropdown", leftX, baseY - 210f,
                new[] { "No Water", "Few Lakes", "Some Lakes", "Many Lakes", "Islands Map" }, 2);
            layoutDropdown = AddDropdown(sizeDropdown, parent, "Layout_Dropdown", leftX, baseY - 245f,
                new[] { "Random Layout", "Ring Layout", "Ring with Center", "Inner Ring", "Double Neutral", "Pockets Layout", "Hub Layout" }, 0);
            // Second column, level with the seed row: starting towns first, then the win conditions.
            float rightX = leftX + ColumnWidth;
            townsDropdown = AddDropdown(sizeDropdown, parent, "Towns_Dropdown", rightX, baseY - 35f,
                new[] { "Starting Towns: Fit the Terrain", "Starting Towns: Random" }, 0);
            AddLayoutText(sizeDropdown, sizeRect, parent, leftX, baseY - 288f);
            for (int i = 0; i < WinChoices.Length; i++)
                winDropdowns[i] = AddDropdown(sizeDropdown, parent, "Win_" + WinChoices[i].id + "_Dropdown", rightX, baseY - 70f - 35f * i,
                    new[] { WinChoices[i].label + ": Off", WinChoices[i].label + ": On" }, 0);
            // Last in the right column: a left-right mirror image map (needs an even player count).
            mirrorDropdown = AddDropdown(sizeDropdown, parent, "Mirror_Dropdown", rightX, baseY - 70f - 35f * WinChoices.Length,
                new[] { "Mirrored Map: Off", "Mirrored Map: On" }, 0);

            // Grow the dialog's background frame down by the left column's added rows and right by the second column.
            foreach (object rectObj in GameApi.GetComponentsInChildren(dialog, GameApi.RectTransform, true))
            {
                dynamic rect = rectObj;
                string name = ((string)rect.gameObject.name).ToLowerInvariant();
                if (name.Contains("bg") || name.Contains("background") || name.Contains("panel"))
                {
                    rect.sizeDelta = GameApi.NewVector2((float)rect.sizeDelta.x + ColumnWidth, (float)rect.sizeDelta.y + ExtraHeight);
                    rect.anchoredPosition = GameApi.NewVector2((float)rect.anchoredPosition.x + ColumnWidth / 2f, (float)rect.anchoredPosition.y - ExtraHeight / 2f);
                }
            }
        }

        /// <summary>A copy of the size dropdown's caption label (a lone text object, unlike the dialog's
        /// template field, whose copy brought every dropdown and field with it) under the Layout dropdown, as wide as both
        /// columns, for the layout description. Hidden until a layout other than Random is picked.</summary>
        private static void AddLayoutText(dynamic sizeDropdown, dynamic sizeRect, object parent, float leftX, float y)
        {
            layoutText = null;
            shownLayout = -1;
            try
            {
                if (GameApi.TextComponent == null || sizeDropdown.captionText == null) return;
                dynamic go = GameApi.Instantiate(sizeDropdown.captionText.gameObject, parent);
                if ((int)go.transform.childCount > 0)
                {
                    // Not a lone label: copying it would copy other UI too.
                    GameApi.Destroy(go);
                    Logger.LogWarning("The layout description could not be added: the label has child objects.");
                    return;
                }
                go.name = "Layout_Description";
                dynamic rect = GameApi.GetComponent(go, GameApi.RectTransform);
                // Same anchors and pivot as the dropdowns, so x/y mean the same thing.
                rect.anchorMin = sizeRect.anchorMin;
                rect.anchorMax = sizeRect.anchorMax;
                rect.pivot = sizeRect.pivot;
                float pivotX = (float)sizeRect.pivot.x;
                rect.sizeDelta = GameApi.NewVector2(300f + ColumnWidth, 50f);
                rect.anchoredPosition = GameApi.NewVector2(leftX + pivotX * ColumnWidth, y);

                dynamic text = GameApi.GetComponent(go, GameApi.TextComponent);
                text.text = "";
                text.fontSize = 8f;
                GameApi.TrySet(text, "enableWordWrapping", true);
                GameApi.TrySetEnum(text, "alignment", GameApi.TextAlignment, "TopLeft");
                go.SetActive(false);
                layoutText = go;
            }
            catch (Exception ex) { Logger.LogWarning($"Could not add the layout description: {ex.Message}"); layoutText = null; }
        }

        /// <summary>Shows the description of the picked layout (once per change); runs every frame.</summary>
        private static void UpdateLayoutText()
        {
            if (layoutText == null || layoutDropdown == null) return;
            try
            {
                int index = Math.Clamp(Selected(layoutDropdown, 0), 0, LayoutTexts.Length - 1);
                if (index == shownLayout) return;
                shownLayout = index;
                dynamic go = layoutText;
                if (index == 0) { go.SetActive(false); return; }
                ((dynamic)GameApi.GetComponent(go, GameApi.TextComponent)).text = LayoutTexts[index];
                go.SetActive(true);
            }
            catch { layoutText = null; } // the dialog was destroyed; the next one adds its own
        }

        /// <summary>A copy of `source` (the size dropdown) at (x, y), 300px wide, with `choices`.</summary>
        private static object AddDropdown(dynamic source, object parent, string name, float x, float y, string[] choices, int defaultIndex)
        {
            dynamic go = GameApi.Instantiate(source.gameObject, parent);
            go.name = name;
            dynamic rect = GameApi.GetComponent(go, GameApi.RectTransform);
            rect.anchoredPosition = GameApi.NewVector2(x, y);
            rect.sizeDelta = GameApi.NewVector2(300f, (float)rect.sizeDelta.y);

            dynamic dropdown = GameApi.GetComponent(go, GameApi.Dropdown);
            dropdown.ClearOptions();
            dropdown.AddOptions((dynamic)GameApi.NewOptionList(choices));
            dropdown.value = defaultIndex;
            return dropdown;
        }

        private static int Selected(object dropdown, int fallback) => dropdown != null ? (int)((dynamic)dropdown).value : fallback;

        // ── Generate button: run tse, open the result ───────────────────────
        // tse runs without a window of its own (--progress): a second top-level
        // window takes the focus from the fullscreen game, and over exclusive
        // fullscreen it can't be drawn on top either. The game keeps running,
        // the dialog shows the percentage, and once tse has exited the map is
        // opened and the game is put back in front if anything took the focus.
        // Without a per-frame hook (GameApi.PerFrameMethod) the old behaviour
        // remains: wait for tse on the game thread, with tse's window shown.

        /// <summary>A generation running in the background, null when idle.</summary>
        private static Process runningTse;
        private static object runningDialog;
        private static string runningOutputPath, runningProgressFile, savedLabelText;
        private static DateTime nextPoll;
        private static IntPtr gameWindow;
        private static bool backgroundGeneration;

        public static bool OnBtnPrefix(object __instance)
        {
            try { Generate(__instance); }
            catch (Exception ex)
            {
                Logger.LogError($"Map generation failed: {ex}");
                runningTse = null;
            }
            return false; // never run the game's own generator
        }

        /// <summary>Runs once per frame (a Harmony postfix on GameApi.PerFrameMethod).</summary>
        public static void TickPostfix()
        {
            UpdateLayoutText();
            if (pendingOpenPath != null) { try { RetryOpen(); } catch (Exception ex) { Logger.LogError($"Opening the generated map failed: {ex}"); pendingOpenPath = null; } }
            if (runningTse == null) return;
            try { Tick(); }
            catch (Exception ex)
            {
                Logger.LogError($"Map generation failed: {ex}");
                runningTse = null;
            }
        }

        private static void Generate(object newGenMap)
        {
            if (runningTse != null) return; // already generating

            dynamic dialog = GameApi.Cast(newGenMap, GameApi.NewGenMap);

            string templateName = dialog.template != null ? (string)dialog.template.text : "jebusCross";
            int sizeIndex = dialog.dropdown != null ? (int)dialog.dropdown.value : 3;

            var sizes = GameApi.MapSizes(newGenMap);
            if (sizes == null || sizeIndex < 0 || sizeIndex >= sizes.Count)
            {
                Logger.LogError($"Could not read the game's map size list (index {sizeIndex}, {(sizes == null ? "no list" : sizes.Count + " entries")})");
                return;
            }
            string mapSize = $"{sizes[sizeIndex].x}x{sizes[sizeIndex].z}";

            // "Random Seed" (default): no --seed, so tse rolls its own. Otherwise the
            // game's seed field (a number; anything else is 0).
            string seedArg = "";
            if (Selected(seedDropdown, 0) == 1)
            {
                int seed = 0;
                string seedText = dialog.seed != null ? (string)dialog.seed.text : null;
                if (!string.IsNullOrEmpty(seedText)) int.TryParse(seedText, out seed);
                seedArg = $" --seed {seed}";
            }

            int[] playerCounts = { 2, 3, 4, 5, 6, 7, 8 };
            int players = playerCounts[Math.Clamp(Selected(playersDropdown, 0), 0, playerCounts.Length - 1)];

            string layoutArg = LayoutArgs[Math.Clamp(Selected(layoutDropdown, 0), 0, LayoutArgs.Length - 1)];
            var wins = new System.Collections.Generic.List<string>();
            for (int i = 0; i < WinChoices.Length; i++)
                if (Selected(winDropdowns[i], 0) == 1) wins.Add(WinChoices[i].id);

            bool mirror = Selected(mirrorDropdown, 0) == 1;
            if (mirror && players % 2 != 0)
            {
                Logger.LogWarning($"Mirrored Map needs an even player count — ignored with {players} players");
                mirror = false;
            }
            // A mirrored map has no islands (their portals are not mirrored): Some Lakes instead.
            int water = Selected(waterDropdown, 2);
            if (mirror && water == 4)
            {
                Logger.LogInfo("Mirrored Map has no islands — using Some Lakes instead");
                water = 2;
            }

            string outputPath = Path.Combine(MapsDirectory(), OutputFileName);

            string tse = FindTse();
            if (tse == null)
            {
                Logger.LogError($"Scenario Editor (app.exe) not found — reinstall it with the map editor mod option, or set TseExecutable in BepInEx/config/{PluginGuid}.cfg.");
                return;
            }

            string progressFile = backgroundGeneration ? Path.Combine(Path.GetTempPath(), "tse-rmg-progress.json") : null;
            if (progressFile != null) { try { File.Delete(progressFile); } catch { } }
            if (File.Exists(outputPath)) { try { File.Delete(outputPath); } catch { } }

            var startInfo = new ProcessStartInfo
            {
                FileName = tse,
                Arguments = $"--generate --template \"{templateName}\" --size {mapSize}{seedArg} --players {players}"
                    + $" --richness {Selected(richnessDropdown, 2)} --complexity {Selected(complexityDropdown, 2)}"
                    + $" --difficulty {Selected(difficultyDropdown, 1)} --water {water} --output \"{outputPath}\""
                    + (layoutArg.Length > 0 ? $" --layout {layoutArg}" : "")
                    + (wins.Count > 0 ? $" --win classic,{string.Join(",", wins)}" : "")
                    + (Selected(townsDropdown, 0) == 1 ? " --faction random" : "")
                    + (mirror ? " --mirror true" : "")
                    + (progressFile != null ? $" --progress \"{progressFile}\"" : ""),
                CreateNoWindow = true,
                UseShellExecute = false,
            };

            gameWindow = NativeWindow.GameWindow();
            Logger.LogInfo($"Display mode: {GameApi.FullScreenMode()}; game window in front: {NativeWindow.IsForeground(gameWindow)}");
            Logger.LogInfo($"Running RMG: {startInfo.FileName} {startInfo.Arguments}");
            Process process = Process.Start(startInfo);
            if (process == null)
            {
                Logger.LogError("Could not start the Scenario Editor");
                return;
            }
            // Only a visible tse window needs the right to take the foreground.
            if (progressFile == null) NativeWindow.AllowForeground(process.Id);

            runningTse = process;
            runningDialog = dialog;
            runningOutputPath = outputPath;
            runningProgressFile = progressFile;
            nextPoll = DateTime.UtcNow;
            savedLabelText = null;

            if (progressFile != null)
            {
                // Leave the dialog up, with the percentage where the template name is.
                try { if (dialog.template != null) { savedLabelText = (string)dialog.template.text; dialog.template.text = "Generating map… 0 %"; } }
                catch (Exception ex) { Logger.LogWarning($"Could not show progress in the dialog: {ex.Message}"); }
                return; // Tick() finishes it
            }

            dialog.Hide();
            process.WaitForExit();
            Complete();
        }

        private static void Tick()
        {
            DateTime now = DateTime.UtcNow;
            bool exited = runningTse.HasExited;
            if (!exited && now < nextPoll) return;
            nextPoll = now.AddMilliseconds(250);
            if (exited) { Complete(); return; }
            ShowProgress();
        }

        private static void ShowProgress()
        {
            if (runningProgressFile == null || savedLabelText == null) return;
            try
            {
                var match = System.Text.RegularExpressions.Regex.Match(File.ReadAllText(runningProgressFile), "\"pct\"\\s*:\\s*(\\d+(?:\\.\\d+)?)");
                if (!match.Success) return;
                int pct = (int)Math.Round(double.Parse(match.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture));
                ((dynamic)runningDialog).template.text = $"Generating map… {Math.Clamp(pct, 0, 100)} %";
            }
            catch { /* the file may be mid-write, or not there yet — try again next time */ }
        }

        /// <summary>tse has exited: tidy up, open the map, make sure the game is in front.</summary>
        private static void Complete()
        {
            Process process = runningTse;
            object dialog = runningDialog;
            string outputPath = runningOutputPath, progressFile = runningProgressFile, savedLabel = savedLabelText;
            runningTse = null;
            runningDialog = null;
            using (process) Logger.LogInfo($"RMG exited with code {process.ExitCode}");
            if (progressFile != null) { try { File.Delete(progressFile); } catch { } }

            bool front = NativeWindow.BringToFront(gameWindow);
            try
            {
                if (savedLabel != null) ((dynamic)dialog).template.text = savedLabel;
                ((dynamic)dialog).Hide();
            }
            catch (Exception ex) { Logger.LogWarning($"Could not close the generate dialog: {ex.Message}"); }

            OpenGeneratedMap(outputPath);
            if (!NativeWindow.IsForeground(gameWindow)) front = NativeWindow.BringToFront(gameWindow);
            Logger.LogInfo($"Game window in front after generating: {front}");
        }

        private static void OpenGeneratedMap(string outputPath)
        {
            if (!File.Exists(outputPath))
            {
                Logger.LogError($"RMG output not found: {outputPath}");
                return;
            }
            Logger.LogInfo($"RMG output: {outputPath} ({new FileInfo(outputPath).Length} bytes)");

            object editor = GameApi.GetStatic(GameApi.MapEditor, "me");
            if (editor == null)
            {
                Logger.LogError("Map editor instance (BhMapEditor.me) is null, cannot open the map");
                return;
            }

            // The game indexes the files of the user's my_maps folder as "maps/user/..." but may notice a new file a
            // moment after it is written: keep looking for a few seconds before giving up.
            if (TryOpen(editor)) return;
            pendingOpenPath = outputPath;
            pendingOpenUntil = DateTime.UtcNow.AddSeconds(15);
            nextOpenTry = DateTime.UtcNow;
            Logger.LogInfo($"\"{IndexKey}\" is not in the game's file index yet, waiting for it");
        }

        private const string IndexKey = "maps/user/" + OutputFileName;
        private static string pendingOpenPath;
        private static DateTime pendingOpenUntil, nextOpenTry;

        private static bool TryOpen(object editor)
        {
            object fileHandle = GameApi.FindIndexedFile(IndexKey);
            if (fileHandle == null) return false;
            ((dynamic)GameApi.Cast(editor, GameApi.MapEditor)).Load((dynamic)fileHandle);
            Logger.LogInfo("Generated map opened in the map editor");
            return true;
        }

        private static void RetryOpen()
        {
            if (DateTime.UtcNow < nextOpenTry) return;
            nextOpenTry = DateTime.UtcNow.AddSeconds(0.5);
            object editor = GameApi.GetStatic(GameApi.MapEditor, "me");
            if (editor != null && TryOpen(editor)) { pendingOpenPath = null; return; }
            if (DateTime.UtcNow < pendingOpenUntil) return;
            Logger.LogError($"\"{IndexKey}\" never appeared in the game's file index; the map is saved as {pendingOpenPath}. The game's file index: {GameApi.DescribeIndex()}. Restart the game once so it indexes the file.");
            pendingOpenPath = null;
        }
    }
}
