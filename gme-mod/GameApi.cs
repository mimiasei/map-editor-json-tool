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
        // Obfuscated game names. These are only hints: when a name has changed, the
        // member is found by its shape instead (see FindMapSizes and IndexSources), so
        // a game update normally needs no change here.
        private const string FileManagerType = "qu";          // FileManager
        private const string FileManagerInstance = "bvns";    // static FileManager instance
        // Dictionaries<string virtualPath, file handle>; which of them holds a given path is found by looking in each.
        private static readonly string[] FileIndexes = { "bvod", "bvoe" };
        private const string NewGenMapSizes = "bzyv";         // BhNewGenMap: List<MapSize> behind the size dropdown
        private const string MapSizeX = "bzyx";
        private const string MapSizeZ = "bzyy";

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
        public static Type Il2CppDictionary; // Il2CppSystem.Collections.Generic.Dictionary`2
        // Optional (not needed for the mod to work):
        public static Type TextComponent;  // TMPro.TMP_Text, for the layout description
        public static Type TextAlignment;  // TMPro.TextAlignmentOptions
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
            FileManager = FindType("Hex", FileManagerType, required: false);
            RectTransform = FindType("UnityEngine.CoreModule", "UnityEngine.RectTransform");
            GameObject = FindType("UnityEngine.CoreModule", "UnityEngine.GameObject");
            UnityObject = FindType("UnityEngine.CoreModule", "UnityEngine.Object");
            Transform = FindType("UnityEngine.CoreModule", "UnityEngine.Transform");
            Vector2 = FindType("UnityEngine.CoreModule", "UnityEngine.Vector2");
            Application = FindType("UnityEngine.CoreModule", "UnityEngine.Application");
            Dropdown = FindType("Unity.TextMeshPro", "TMPro.TMP_Dropdown");
            OptionData = FindType("Unity.TextMeshPro", "TMPro.TMP_Dropdown+OptionData");
            Il2CppList = FindType("Il2Cppmscorlib", "Il2CppSystem.Collections.Generic.List`1");
            Il2CppDictionary = FindType("Il2Cppmscorlib", "Il2CppSystem.Collections.Generic.Dictionary`2", required: false);

            TextComponent = FindType("Unity.TextMeshPro", "TMPro.TMP_Text", required: false);
            TextAlignment = FindType("Unity.TextMeshPro", "TMPro.TextAlignmentOptions", required: false);
            Screen = FindType("UnityEngine.CoreModule", "UnityEngine.Screen", required: false);
            EventSystem = FindType("UnityEngine.UI", "UnityEngine.EventSystems.EventSystem", required: false);
            PerFrameMethod = EventSystem?.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .FirstOrDefault(m => m.Name == "Update" && m.GetParameters().Length == 0);

            NewGenMapStart = RequireMethod(NewGenMap, "Start");
            NewGenMapOnBtn = RequireMethod(NewGenMap, "OnBtn");
            RequireProperty(NewGenMap, "dropdown");
            RequireProperty(NewGenMap, "template");
            RequireProperty(NewGenMap, "seed");
            FindMapSizes();
            RequireMethod(NewGenMap, "Hide");
            RequireProperty(MapEditor, "me");
            RequireMethod(MapEditor, "Load");
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

        /// <summary>UnityEngine.Object.Destroy(obj)</summary>
        public static void Destroy(object obj)
        {
            MethodInfo method = UnityObject.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .First(m => m.Name == "Destroy" && m.GetParameters().Length == 1);
            method.Invoke(null, new[] { Cast(obj, UnityObject) });
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

        /// <summary>target.name = value, ignored when the property doesn't exist (names differ between TextMeshPro versions).</summary>
        public static void TrySet(object target, string name, object value)
        {
            try { target.GetType().GetProperty(name)?.SetValue(target, value); } catch { }
        }

        /// <summary>target.name = the enum member `member` of `enumType`, ignored on any failure.</summary>
        public static void TrySetEnum(object target, string name, Type enumType, string member)
        {
            try { if (enumType != null) target.GetType().GetProperty(name)?.SetValue(target, Enum.Parse(enumType, member)); } catch { }
        }

        public static string PersistentDataPath => (string)GetStatic(Application, "persistentDataPath");

        /// <summary>The game's map size list behind the size dropdown: (x, z) per entry.</summary>
        public static List<(int x, int z)> MapSizes(object newGenMap)
        {
            var sizes = new List<(int, int)>();
            dynamic list = sizesProperty.GetValue(newGenMap);
            if (list == null) return null;
            for (int i = 0; i < (int)list.Count; i++)
            {
                object entry = list[i];
                sizes.Add(((int)sizeXProperty.GetValue(entry), (int)sizeZProperty.GetValue(entry)));
            }
            return sizes;
        }

        // ── Map sizes ───────────────────────────────────────────────────────

        private static PropertyInfo sizesProperty, sizeXProperty, sizeZProperty;

        /// <summary>
        /// Finds the size list behind the dropdown: a List&lt;T&gt; property of BhNewGenMap whose T
        /// holds two int properties (width, depth). The remembered names are preferred.
        /// </summary>
        private static void FindMapSizes()
        {
            if (NewGenMap == null || Il2CppList == null) return;
            const BindingFlags flags = BindingFlags.Public | BindingFlags.Instance;
            var found = new List<(PropertyInfo list, PropertyInfo x, PropertyInfo z)>();
            foreach (PropertyInfo property in NewGenMap.GetProperties(flags))
            {
                Type type = property.PropertyType;
                if (!type.IsGenericType || type.GetGenericTypeDefinition() != Il2CppList) continue;
                var ints = type.GetGenericArguments()[0].GetProperties(flags).Where(p => p.PropertyType == typeof(int)).OrderBy(p => p.MetadataToken).ToList();
                if (ints.Count != 2) continue;
                PropertyInfo named(string name) => ints.FirstOrDefault(p => p.Name == name);
                found.Add((property, named(MapSizeX) ?? ints[0], named(MapSizeZ) ?? ints[1]));
            }
            if (found.Count == 0) { missing.Add($"a List<T> of width/depth sizes on {NewGenMap.FullName}"); return; }
            var pick = found.FirstOrDefault(f => f.list.Name == NewGenMapSizes);
            if (pick.list == null) pick = found[0];
            if (pick.list.Name != NewGenMapSizes) log.LogWarning($"Map size list found by its shape: {pick.list.Name} ({pick.x.Name}, {pick.z.Name}){(found.Count > 1 ? $", one of {found.Count} candidates" : "")}");
            (sizesProperty, sizeXProperty, sizeZProperty) = pick;
        }

        // ── The game's file index ───────────────────────────────────────────

        /// <summary>One dictionary of the file manager: the static property holding the instance, and the property holding the dictionary.</summary>
        private sealed class IndexSource
        {
            public PropertyInfo Instance, Dictionary;
            public override string ToString() => $"{Instance.DeclaringType.Name}.{Instance.Name} -> {Dictionary.Name}";
        }

        private static List<IndexSource> indexSources;
        private static bool scanned;

        private static IEnumerable<IndexSource> NamedIndexSources()
        {
            if (FileManager == null) yield break;
            PropertyInfo instance = FileManager.GetProperty(FileManagerInstance, BindingFlags.Public | BindingFlags.Static);
            if (instance == null) yield break;
            foreach (string name in FileIndexes)
            {
                PropertyInfo dictionary = FileManager.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
                if (dictionary != null) yield return new IndexSource { Instance = instance, Dictionary = dictionary };
            }
        }

        /// <summary>
        /// Every dictionary that could be the file index, found by its shape: a Dictionary&lt;string, T&gt;
        /// property on a class with a static property of its own type (the singleton), where T is something
        /// BhMapEditor.Load accepts. Slow (it walks every game type), so only done when the remembered names fail.
        /// </summary>
        private static IEnumerable<IndexSource> ScannedIndexSources()
        {
            if (Il2CppDictionary == null || MapEditor == null) yield break;
            var loadParameters = MapEditor.GetMethods(BindingFlags.Public | BindingFlags.Instance)
                .Where(m => m.Name == "Load" && m.GetParameters().Length == 1)
                .Select(m => m.GetParameters()[0].ParameterType).ToList();
            Type[] types;
            try { types = MapEditor.Assembly.GetTypes(); }
            catch (ReflectionTypeLoadException ex) { types = ex.Types.Where(t => t != null).ToArray(); }
            foreach (Type type in types)
            {
                PropertyInfo[] properties;
                try { properties = type.GetProperties(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly); }
                catch { continue; }
                PropertyInfo instance = properties.FirstOrDefault(p => p.PropertyType == type && p.GetMethod != null && p.GetMethod.IsStatic);
                if (instance == null) continue;
                foreach (PropertyInfo p in properties)
                {
                    if (p.GetMethod == null || p.GetMethod.IsStatic || !p.PropertyType.IsGenericType || p.PropertyType.GetGenericTypeDefinition() != Il2CppDictionary) continue;
                    Type[] args = p.PropertyType.GetGenericArguments();
                    if (args[0] == typeof(string) && loadParameters.Any(l => l.IsAssignableFrom(args[1]))) yield return new IndexSource { Instance = instance, Dictionary = p };
                }
            }
        }

        /// <summary>How many files the game's file indexes hold, for the log when a lookup fails.</summary>
        public static string DescribeIndex()
        {
            try
            {
                var parts = new List<string>();
                foreach (IndexSource source in indexSources ?? NamedIndexSources().ToList())
                {
                    dynamic dictionary = source.Dictionary.GetValue(source.Instance.GetValue(null));
                    parts.Add(dictionary == null ? $"{source}: null" : $"{source}: {(int)dictionary.Count} file(s)");
                }
                return parts.Count > 0 ? string.Join(", ", parts) : "(no file index found)";
            }
            catch (Exception ex) { return "(could not read: " + ex.Message + ")"; }
        }

        /// <summary>The file manager's file handle for a virtual path (e.g. "maps/user/x.map"), or null.</summary>
        public static object FindIndexedFile(string virtualPath)
        {
            if (indexSources == null) indexSources = NamedIndexSources().ToList();
            object handle = Lookup(indexSources, virtualPath);
            if (handle != null || scanned || indexSources.Count > 0) return handle;
            // The remembered names are gone: look for the index by its shape, once.
            scanned = true;
            var found = ScannedIndexSources().ToList();
            if (found.Count > 0) log.LogWarning($"File index found by its shape: {string.Join("; ", found)}");
            else log.LogError("No dictionary shaped like the game's file index was found");
            indexSources = found;
            return Lookup(indexSources, virtualPath);
        }

        private static object Lookup(List<IndexSource> sources, string virtualPath)
        {
            foreach (IndexSource source in sources)
            {
                dynamic index = null;
                try { index = source.Dictionary.GetValue(source.Instance.GetValue(null)); } catch { }
                if (index != null && (bool)index.ContainsKey(virtualPath)) return index[virtualPath];
            }
            return null;
        }
    }
}
