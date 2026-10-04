// ─── Game installation folder detection ──────────────────────────────────────
// Finds the Heroes of Might and Magic: Olden Era install folder, in order:
//   1. `game-path.txt` next to the app executable — written by the Windows
//      installer (windows/installer-hooks.nsh) when the user confirmed or picked
//      the folder during setup;
//   2. Steam: the Steam root (Windows registry, else the platform's default
//      Steam folders) → every library in `steamapps/libraryfolders.vdf` → the
//      library holding the game's app manifest → `steamapps/common/<installdir>`;
//   3. the game's default folder names under each Steam library.
// A folder only counts when it holds the game's Core.zip.

use std::path::{Path, PathBuf};

/// The game's Steam app id.
const APP_ID: &str = "3105440";
/// Folder names the game has been seen installed under.
const DEFAULT_FOLDER_NAMES: [&str; 2] = [
    "Heroes of Might and Magic Olden Era",
    "Heroes of Might & Magic Olden Era",
];
/// File next to the executable where the installer stores the chosen folder.
pub const GAME_PATH_FILE: &str = "game-path.txt";

fn is_game_dir(dir: &Path) -> bool {
    dir.join("HeroesOldenEra_Data").join("StreamingAssets").join("Core.zip").is_file()
}

fn from_installer_file() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let text = std::fs::read_to_string(exe.parent()?.join(GAME_PATH_FILE)).ok()?;
    let dir = PathBuf::from(text.trim());
    is_game_dir(&dir).then_some(dir)
}

#[cfg(windows)]
fn steam_roots() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    let mut roots = Vec::new();
    // InstallPath first: it keeps the folder's real casing, while the per-user
    // SteamPath is lowercased with forward slashes.
    let lookups = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
        (HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
    ];
    for (hive, key, value) in lookups {
        if let Ok(path) = RegKey::predef(hive).open_subkey(key).and_then(|k| k.get_value::<String, _>(value)) {
            roots.push(PathBuf::from(path.replace('/', "\\")));
        }
    }
    roots.push(PathBuf::from(r"C:\Program Files (x86)\Steam"));
    roots.push(PathBuf::from(r"C:\Program Files\Steam"));
    roots
}

#[cfg(not(windows))]
fn steam_roots() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else { return Vec::new() };
    vec![
        home.join("Library/Application Support/Steam"),
        home.join(".steam/steam"),
        home.join(".local/share/Steam"),
        home.join(".var/app/com.valvesoftware.Steam/.local/share/Steam"),
    ]
}

/// The quoted tokens of a VDF line: `"key"  "value"` → ["key", "value"].
fn vdf_tokens(line: &str) -> Vec<String> {
    line.split('"')
        .enumerate()
        .filter(|(i, _)| i % 2 == 1)
        .map(|(_, t)| t.replace("\\\\", "\\"))
        .collect()
}

/// Every Steam library folder listed by `root`'s libraryfolders.vdf, the root
/// itself included.
fn steam_libraries(root: &Path) -> Vec<PathBuf> {
    let mut libraries = vec![root.to_path_buf()];
    let vdf = root.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = std::fs::read_to_string(vdf) {
        for line in text.lines() {
            let tokens = vdf_tokens(line);
            if tokens.len() == 2 && tokens[0].eq_ignore_ascii_case("path") {
                let path = if cfg!(windows) { tokens[1].replace('/', "\\") } else { tokens[1].clone() };
                libraries.push(PathBuf::from(path));
            }
        }
    }
    libraries
}

/// The `installdir` from the game's app manifest in `library`, if it has one.
fn manifest_install_dir(library: &Path) -> Option<String> {
    let manifest = library.join("steamapps").join(format!("appmanifest_{APP_ID}.acf"));
    let text = std::fs::read_to_string(manifest).ok()?;
    text.lines().find_map(|line| {
        let tokens = vdf_tokens(line);
        (tokens.len() == 2 && tokens[0].eq_ignore_ascii_case("installdir")).then(|| tokens[1].clone())
    })
}

fn from_steam() -> Option<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    for root in steam_roots() {
        for library in steam_libraries(&root) {
            let key = library.to_string_lossy().to_lowercase().replace('/', "\\");
            if !seen.insert(key) {
                continue;
            }
            let common = library.join("steamapps").join("common");
            if let Some(dir) = manifest_install_dir(&library).map(|name| common.join(name)) {
                if is_game_dir(&dir) {
                    return Some(dir);
                }
            }
            for name in DEFAULT_FOLDER_NAMES {
                let dir = common.join(name);
                if is_game_dir(&dir) {
                    return Some(dir);
                }
            }
        }
    }
    None
}

/// The game's install folder, or None when it can't be found.
pub fn detect() -> Option<PathBuf> {
    from_installer_file().or_else(from_steam)
}

/// `app --detect-game-dir [--out <file>]`: handled before the app window
/// starts (used by the Windows installer). Writes the folder (or an empty
/// file when not found) and returns true when the flag was present.
pub fn handle_cli() -> bool {
    let args: Vec<String> = std::env::args().collect();
    if !args.iter().any(|a| a == "--detect-game-dir") {
        return false;
    }
    let found = detect().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default();
    match args.iter().position(|a| a == "--out").and_then(|i| args.get(i + 1)) {
        Some(out) => {
            let _ = std::fs::write(out, &found);
        }
        None => println!("{found}"),
    }
    true
}
