// ─── Game / Unity access by name ─────────────────────────────────────────────
// The mod is compiled without the game's BepInEx interop assemblies (they are
// generated from the game on each player's machine and can't be in the repo or
// on CI), so every game and Unity type and member is looked up here at runtime.
//
// The obfuscated names (qp, bufc, bufo, byok, byom, byon, …) change when the
// game is updated. Resolve() checks every one at startup and logs each name it
// can't find, so after an update the BepInEx log says exactly what to rename.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using BepInEx;
using BepInEx.Logging;
using Il2CppInterop.Runtime.InteropTypes;

namespace GmeRmgMod
{
    internal static class GameApi
    {
        // Obfuscated game names — update here after a game update.
        private const string FileManagerType = "qp";          // FileManager
        private const string FileManagerInstance = "bufc";    // static FileManager instance
        private const string FileIndex = "bufo";              // Dictionary<string virtualPath, file handle>
        private const string NewGenMapSizes = "byok";         // BhNewGenMap: List<MapSize> behind the size dropdown
        private const string MapSizeX = "byom";
        private const string MapSizeZ = "byon";

        public static Type NewGenMap;      // Hex.MapEditor.BhNewGenMap
        public static Type MapEditor;      // Hex.MapEditor.BhMapEditor
        public static Type FileManager;    // qp
        public static Type RectTransform;  // UnityEngine.RectTransform
        public static Type GameObject;     // UnityEngine.GameObject
        public static Type UnityObject;    // UnityEngine.Object
        public static Type Transform;      // UnityEngine.Transform
        public static Type Vector2;        // UnityEngine.Vector2
        public static Type Application;    // UnityEngine.Application
        public static Type Dropdown;       // TMPro.TMP_Dropdown
        public static Type OptionData;     // TMPro.TMP_Dropdown+OptionData
        public static Type Il2CppList;     // Il2CppSystem.Collections.Generic.List`1
        // Optional (not needed for the mod to work):
        public static Type Screen;         // UnityEngine.Screen, only to log the display mode
        public static Type EventSystem;    // UnityEngine.EventSystems.EventSystem, its Update runs every frame

        public static MethodInfo NewGenMapStart;
        public static MethodInfo NewGenMapOnBtn;
        /// <summary>A method that runs once per frame while the game's UI is up; null if not found.</summary>
        public static MethodInfo PerFrameMethod;

        private static ManualLogSource log;
        private static readonly List<string> missing = new List<string>();

        /// <summary>Looks everything up; false (with each missing name logged) when anything is absent.</summary>
        public static bool Resolve(ManualLogSource logger)
        {
            log = logger;
            missing.Clear();

            NewGenMap = FindType("Hex", "Hex.MapEditor.BhNewGenMap");
            MapEditor = FindType("Hex", "Hex.MapEditor.BhMapEditor");
            FileManager = FindType("Hex", FileManagerType);
            RectTransform = FindType("UnityEngine.CoreModule", "UnityEngine.RectTransform");
            GameObject = FindType("UnityEngine.CoreModule", "UnityEngine.GameObject");
            UnityObject = FindType("UnityEngine.CoreModule", "UnityEngine.Object");
            Transform = FindType("UnityEngine.CoreModule", "UnityEngine.Transform");
            Vector2 = FindType("UnityEngine.CoreModule", "UnityEngine.Vector2");
            Application = FindType("UnityEngine.CoreModule", "UnityEngine.Application");
            Dropdown = FindType("Unity.TextMeshPro", "TMPro.TMP_Dropdown");
            OptionData = FindType("Unity.TextMeshPro", "TMPro.TMP_Dropdown+OptionData");
            Il2CppList = FindType("Il2Cppmscorlib", "Il2CppSystem.Collections.Generic.List`1");

            Screen = FindType("UnityEngine.CoreModule", "UnityEngine.Screen", required: false);
            EventSystem = FindType("UnityEngine.UI", "UnityEngine.EventSystems.EventSystem", required: false);
            PerFrameMethod = EventSystem?.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .FirstOrDefault(m => m.Name == "Update" && m.GetParameters().Length == 0);

            NewGenMapStart = RequireMethod(NewGenMap, "Start");
            NewGenMapOnBtn = RequireMethod(NewGenMap, "OnBtn");
            RequireProperty(NewGenMap, "dropdown");
            RequireProperty(NewGenMap, "template");
            RequireProperty(NewGenMap, "seed");
            RequireProperty(NewGenMap, NewGenMapSizes);
            RequireMethod(NewGenMap, "Hide");
            RequireProperty(MapEditor, "me");
            RequireMethod(MapEditor, "Load");
            RequireProperty(FileManager, FileManagerInstance);
            RequireProperty(FileManager, FileIndex);
            RequireMethod(UnityObject, "Instantiate");

            foreach (string name in missing) log.LogError($"Game API not found: {name}");
            return missing.Count == 0;
        }

        // ── Lookups ─────────────────────────────────────────────────────────

        private static Type FindType(string assemblyName, string fullName, bool required = true)
        {
            Assembly assembly = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == assemblyName);
            if (assembly == null)
            {
                try { assembly = Assembly.Load(new AssemblyName(assemblyName)); }
                catch
                {
                    string path = Path.Combine(Paths.BepInExRootPath, "interop", assemblyName + ".dll");
                    try { if (File.Exists(path)) assembly = Assembly.LoadFrom(path); } catch { }
                }
            }
            Type type = assembly?.GetType(fullName);
            if (type == null && required) missing.Add($"type {fullName} ({assemblyName})");
            return type;
        }

        private static MethodInfo RequireMethod(Type type, string name)
        {
            if (type == null) return null;
            MethodInfo method = type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static).FirstOrDefault(m => m.Name == name);
            if (method == null) missing.Add($"method {type.FullName}.{name}");
            return method;
        }

        private static void RequireProperty(Type type, string name)
        {
            if (type != null && type.GetProperty(name, BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static) == null)
                missing.Add($"property {type.FullName}.{name}");
        }

        // ── Helpers ─────────────────────────────────────────────────────────

        public static object GetStatic(Type type, string property) =>
            type.GetProperty(property, BindingFlags.Public | BindingFlags.Static).GetValue(null);

        /// <summary>The Il2Cpp object as `type` (Il2CppObjectBase.TryCast&lt;T&gt;).</summary>
        public static object Cast(object il2cppObject, Type type)
        {
            if (il2cppObject == null) return null;
            MethodInfo tryCast = typeof(Il2CppObjectBase).GetMethod(nameof(Il2CppObjectBase.TryCast)).MakeGenericMethod(type);
            return tryCast.Invoke(il2cppObject, null);
        }

        /// <summary>component.GetComponent&lt;type&gt;()</summary>
        public static object GetComponent(object component, Type type)
        {
            MethodInfo generic = component.GetType().GetMethods()
                .First(m => m.Name == "GetComponent" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0);
            return generic.MakeGenericMethod(type).Invoke(component, null);
        }

        /// <summary>component.GetComponentsInChildren&lt;type&gt;(includeInactive)</summary>
        public static IEnumerable GetComponentsInChildren(object component, Type type, bool includeInactive)
        {
            MethodInfo generic = component.GetType().GetMethods()
                .First(m => m.Name == "GetComponentsInChildren" && m.IsGenericMethodDefinition && m.GetParameters().Length == 1
                    && m.GetParameters()[0].ParameterType == typeof(bool));
            return (IEnumerable)generic.MakeGenericMethod(type).Invoke(component, new object[] { includeInactive });
        }

        /// <summary>UnityEngine.Object.Instantiate(original, parent) as a GameObject.</summary>
        public static object Instantiate(object original, object parent)
        {
            MethodInfo method = UnityObject.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .First(m => m.Name == "Instantiate" && !m.IsGenericMethodDefinition && m.GetParameters().Length == 2
                    && m.GetParameters()[1].ParameterType == Transform);
            return Cast(method.Invoke(null, new[] { Cast(original, UnityObject), parent }), GameObject);
        }

        /// <summary>A UnityEngine.Vector2. Returned as dynamic so assigning it to a
        /// Vector2 property through `dynamic` binds (an `object` value doesn't).</summary>
        public static dynamic NewVector2(float x, float y) => Activator.CreateInstance(Vector2, x, y);

        /// <summary>An Il2CppSystem List&lt;TMP_Dropdown.OptionData&gt; holding `choices`.</summary>
        public static object NewOptionList(IEnumerable<string> choices)
        {
            dynamic list = Activator.CreateInstance(Il2CppList.MakeGenericType(OptionData));
            foreach (string choice in choices) list.Add((dynamic)Activator.CreateInstance(OptionData, choice));
            return list;
        }

        /// <summary>UnityEngine.Screen.fullScreenMode as text (ExclusiveFullScreen, FullScreenWindow, ...), for the log.</summary>
        public static string FullScreenMode()
        {
            try { return Screen?.GetProperty("fullScreenMode", BindingFlags.Public | BindingFlags.Static)?.GetValue(null)?.ToString() ?? "unknown"; }
            catch { return "unknown"; }
        }

        public static string PersistentDataPath => (string)GetStatic(Application, "persistentDataPath");

        /// <summary>The game's map size list behind the size dropdown: (x, z) per entry.</summary>
        public static List<(int x, int z)> MapSizes(object newGenMap)
        {
            var sizes = new List<(int, int)>();
            dynamic list = NewGenMap.GetProperty(NewGenMapSizes).GetValue(newGenMap);
            if (list == null) return null;
            for (int i = 0; i < (int)list.Count; i++)
            {
                object entry = list[i];
                sizes.Add(((int)entry.GetType().GetProperty(MapSizeX).GetValue(entry), (int)entry.GetType().GetProperty(MapSizeZ).GetValue(entry)));
            }
            return sizes;
        }

        /// <summary>The FileManager's file handle for a virtual path (e.g. "maps/user/x.map"), or null.</summary>
        public static object FindIndexedFile(string virtualPath)
        {
            object fileManager = GetStatic(FileManager, FileManagerInstance);
            if (fileManager == null)
            {
                log.LogError($"FileManager instance ({FileManagerType}.{FileManagerInstance}) is null");
                return null;
            }
            dynamic index = FileManager.GetProperty(FileIndex).GetValue(fileManager);
            if (index == null || !(bool)index.ContainsKey(virtualPath)) return null;
            return index[virtualPath];
        }
    }
}
