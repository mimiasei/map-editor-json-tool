// Heroes of Might and Magic 3 install folder (GOG "Heroes 3 Complete", checked on a real install:
// HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\1207658787 `path` is the game folder, which holds `Maps`).
// Windows only; other platforms and other storefronts are not detected.

use std::path::PathBuf;

#[cfg(windows)]
pub fn detect() -> Option<PathBuf> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;
    let path: String = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SOFTWARE\WOW6432Node\GOG.com\Games\1207658787")
        .and_then(|k| k.get_value("path"))
        .ok()?;
    let dir = PathBuf::from(path);
    dir.join("Maps").is_dir().then_some(dir)
}

#[cfg(not(windows))]
pub fn detect() -> Option<PathBuf> {
    None
}
