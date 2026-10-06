// ─── GME random map generator mod ────────────────────────────────────────────
// Adds Players / Richness / Complexity / Difficulty / Water dropdowns to the
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
        private static object playersDropdown, richnessDropdown, complexityDropdown, difficultyDropdown, waterDropdown;

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

            playersDropdown = AddDropdown(sizeDropdown, parent, "Players_Dropdown", leftX, baseY - 35f,
                new[] { "2 Players", "3 Players", "4 Players", "5 Players", "6 Players", "7 Players", "8 Players" }, 2);
            richnessDropdown = AddDropdown(sizeDropdown, parent, "Richness_Dropdown", leftX, baseY - 70f,
                new[] { "Poor Economy", "Modest Loot", "Medium Richness", "Rich Map", "Very Rich Map" }, 2);
            complexityDropdown = AddDropdown(sizeDropdown, parent, "Complexity_Dropdown", leftX, baseY - 105f,
                new[] { "Sparse Layout", "Light Objects", "Medium Complexity", "Dense Map", "Very Dense Map" }, 2);
            // The game's six lobby difficulty levels (tse --difficulty 0-5), default Normal
            difficultyDropdown = AddDropdown(sizeDropdown, parent, "Difficulty_Dropdown", leftX, baseY - 140f,
                new[] { "Easy Guards", "Normal Guards", "Hard Guards", "Impossible Guards", "Deadly Guards", "Hell Guards" }, 1);
            waterDropdown = AddDropdown(sizeDropdown, parent, "Water_Dropdown", leftX, baseY - 175f,
                new[] { "No Water", "Few Lakes", "Some Lakes", "Many Lakes", "Islands Map" }, 2);

            // Grow the dialog's background frame by one 35px row per added dropdown.
            foreach (object rectObj in GameApi.GetComponentsInChildren(dialog, GameApi.RectTransform, true))
            {
                dynamic rect = rectObj;
                string name = ((string)rect.gameObject.name).ToLowerInvariant();
                if (name.Contains("bg") || name.Contains("background") || name.Contains("panel"))
                {
                    rect.sizeDelta = GameApi.NewVector2((float)rect.sizeDelta.x, (float)rect.sizeDelta.y + 235f);
                    rect.anchoredPosition = GameApi.NewVector2((float)rect.anchoredPosition.x, (float)rect.anchoredPosition.y - 117.5f);
                }
            }
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

            int seed = 0;
            string seedText = dialog.seed != null ? (string)dialog.seed.text : null;
            if (!string.IsNullOrEmpty(seedText)) int.TryParse(seedText, out seed);

            int[] playerCounts = { 2, 3, 4, 5, 6, 7, 8 };
            int players = playerCounts[Math.Clamp(Selected(playersDropdown, 0), 0, playerCounts.Length - 1)];

            // The game reads maps from users/<last_user>/my_maps.
            string dataPath = GameApi.PersistentDataPath;
            string mapsDir = Path.Combine(dataPath, "my_maps");
            string lastUserFile = Path.Combine(dataPath, "last_user.txt");
            if (File.Exists(lastUserFile))
            {
                string userFolder = File.ReadAllText(lastUserFile).Trim();
                if (!string.IsNullOrEmpty(userFolder)) mapsDir = Path.Combine(dataPath, "users", userFolder, "my_maps");
            }
            Directory.CreateDirectory(mapsDir);
            string outputPath = Path.Combine(mapsDir, OutputFileName);

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
                Arguments = $"--generate --template \"{templateName}\" --size {mapSize} --seed {seed} --players {players}"
                    + $" --richness {Selected(richnessDropdown, 2)} --complexity {Selected(complexityDropdown, 2)}"
                    + $" --difficulty {Selected(difficultyDropdown, 1)} --water {Selected(waterDropdown, 2)} --output \"{outputPath}\""
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

            // Files in the user's my_maps folder are indexed under "maps/user/".
            string key = "maps/user/" + OutputFileName;
            object fileHandle = GameApi.FindIndexedFile(key);
            if (fileHandle == null)
            {
                Logger.LogError($"\"{key}\" not in the game's file index");
                return;
            }
            ((dynamic)GameApi.Cast(editor, GameApi.MapEditor)).Load((dynamic)fileHandle);
            Logger.LogInfo("Generated map opened in the map editor");
        }
    }
}
