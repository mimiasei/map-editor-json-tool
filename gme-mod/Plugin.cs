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

        public static bool OnBtnPrefix(object __instance)
        {
            try { Generate(__instance); }
            catch (Exception ex) { Logger.LogError($"Map generation failed: {ex}"); }
            return false; // never run the game's own generator
        }

        private static void Generate(object newGenMap)
        {
            dynamic dialog = GameApi.Cast(newGenMap, GameApi.NewGenMap);
            dialog.Hide();

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

            var startInfo = new ProcessStartInfo
            {
                FileName = tse,
                Arguments = $"--generate --template \"{templateName}\" --size {mapSize} --seed {seed} --players {players}"
                    + $" --richness {Selected(richnessDropdown, 2)} --complexity {Selected(complexityDropdown, 2)}"
                    + $" --difficulty {Selected(difficultyDropdown, 1)} --water {Selected(waterDropdown, 2)} --output \"{outputPath}\"",
                CreateNoWindow = true,
                UseShellExecute = false,
            };
            Logger.LogInfo($"Running RMG: {startInfo.FileName} {startInfo.Arguments}");
            using (Process process = Process.Start(startInfo))
            {
                process?.WaitForExit();
                if (process != null) Logger.LogInfo($"RMG exited with code {process.ExitCode}");
            }

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
