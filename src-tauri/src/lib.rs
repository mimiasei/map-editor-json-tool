use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder},
    AppHandle, Emitter, Manager, Wry,
};

mod game_dir;
mod text_writer;

use text_writer::{GeneratedText, Provider, StoryDraft, TextRequest, WriterError};

// ─── File > Open Recent ──────────────────────────────────────────────────────
// The list itself lives in the frontend (recent-files.ts); this only draws it into the native submenu. Each entry's menu id is
// "recent:<path>", relayed to the frontend like every other menu item.

struct RecentMenu(Mutex<Option<Submenu<Wry>>>);

// ─── Menu language ───────────────────────────────────────────────────────────
// The labels come from the frontend (set_menu_labels, keyed by menu id) so the native menu follows the UI language. Ids are stable and
// are what the frontend switches on; a missing label falls back to the English text passed to label().

struct MenuLabels(Mutex<HashMap<String, String>>);

fn label(labels: &HashMap<String, String>, id: &str, english: &str) -> String {
    labels.get(id).cloned().unwrap_or_else(|| english.to_string())
}

#[derive(serde::Deserialize)]
struct RecentEntry {
    path: String,
    label: String,
}

#[tauri::command]
fn set_recent_files(
    app: tauri::AppHandle,
    state: tauri::State<RecentMenu>,
    labels: tauri::State<MenuLabels>,
    files: Vec<RecentEntry>,
) -> Result<(), String> {
    let labels = labels.0.lock().map_err(|e| e.to_string())?.clone();
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let Some(menu) = guard.as_ref() else { return Ok(()) };
    for item in menu.items().map_err(|e| e.to_string())? {
        menu.remove(&item).map_err(|e| e.to_string())?;
    }
    if files.is_empty() {
        let none = MenuItemBuilder::with_id("recent-none", label(&labels, "recent-none", "No recent files"))
            .enabled(false)
            .build(&app)
            .map_err(|e| e.to_string())?;
        menu.append(&none).map_err(|e| e.to_string())?;
        return Ok(());
    }
    for file in files {
        let item = MenuItemBuilder::with_id(format!("recent:{}", file.path), file.label)
            .build(&app)
            .map_err(|e| e.to_string())?;
        menu.append(&item).map_err(|e| e.to_string())?;
    }
    let separator = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    menu.append(&separator).map_err(|e| e.to_string())?;
    let clear = MenuItemBuilder::with_id("clear-recent", label(&labels, "clear-recent", "Clear Recent Files"))
        .build(&app)
        .map_err(|e| e.to_string())?;
    menu.append(&clear).map_err(|e| e.to_string())?;
    Ok(())
}

fn build_menu(app: &AppHandle, labels: &HashMap<String, String>) -> tauri::Result<Menu<Wry>> {
    let new_item = MenuItemBuilder::with_id("new", label(labels, "new", "New"))
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", label(labels, "open", "Open..."))
        .accelerator("CmdOrCtrl+O")
        .build(app)?;
    // issue #160: the header's "Import Map"/"Open Map" button is redundant
    // with the native File menu on desktop (same as New/Open/Save/Save As
    // already were) — this gives it a native home instead of removing the
    // capability. No accelerator: Ctrl+O is already "Open" (scenario JSON).
    let open_map_item = MenuItemBuilder::with_id("open-map", label(labels, "open-map", "Open Map...")).build(app)?;
    // Filled by the frontend through set_recent_files once it has loaded; until then (and when empty) a disabled placeholder.
    let recent_placeholder = MenuItemBuilder::with_id("recent-none", label(labels, "recent-none", "No recent files"))
        .enabled(false)
        .build(app)?;
    let recent_menu = SubmenuBuilder::new(app, label(labels, "recent", "Open Recent"))
        .item(&recent_placeholder)
        .build()?;
    *app.state::<RecentMenu>().0.lock().expect("recent menu lock") = Some(recent_menu.clone());
    // Same rationale as open_map_item above: gives the "More" dropdown's
    // existing Import H3 Map action (Toolbar.tsx) a second, native home
    // rather than replacing it.
    let import_h3m_item =
        MenuItemBuilder::with_id("import-h3m", label(labels, "import-h3m", "Import H3 Map...")).build(app)?;
    let save_item = MenuItemBuilder::with_id("save", label(labels, "save", "Save"))
        .accelerator("CmdOrCtrl+S")
        .build(app)?;
    let save_as_item = MenuItemBuilder::with_id("save-as", label(labels, "save-as", "Save As..."))
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;
    // A custom item, not PredefinedMenuItem::quit — the predefined one
    // calls the app's native exit directly, bypassing onCloseRequested
    // entirely (confirmed: quitting from this menu item, or Cmd+Q, never
    // showed the unsaved-changes prompt). Relayed to the frontend like
    // every other item here instead, which just calls win.close() — that
    // still fires closeRequested, reusing the exact same dirty-check flow
    // the window's own [x] button already goes through.
    let quit_item = MenuItemBuilder::with_id("quit", label(labels, "quit", "Quit"))
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;

    let file_menu = SubmenuBuilder::new(app, label(labels, "file", "File"))
        .item(&new_item)
        .item(&open_item)
        .item(&open_map_item)
        .item(&recent_menu)
        .item(&import_h3m_item)
        .separator()
        .item(&save_item)
        .item(&save_as_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let undo_item = MenuItemBuilder::with_id("undo", label(labels, "undo", "Undo"))
        .accelerator("CmdOrCtrl+Z")
        .build(app)?;
    let redo_item = MenuItemBuilder::with_id("redo", label(labels, "redo", "Redo"))
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, label(labels, "edit", "Edit"))
        .item(&undo_item)
        .item(&redo_item)
        .build()?;

    // "About" is handled in the frontend (AboutDialog) rather than by
    // PredefinedMenuItem::about, so the same dialog appears on every platform
    // and can show the build date and stack from src/data/about.json.
    let whats_new_item = MenuItemBuilder::with_id("whats-new", label(labels, "whats-new", "What's new")).build(app)?;
    let about_item = MenuItemBuilder::with_id("about", label(labels, "about", "About")).build(app)?;
    let updates_item =
        MenuItemBuilder::with_id("check-updates", label(labels, "check-updates", "Check for Updates...")).build(app)?;

    let help_menu = SubmenuBuilder::new(app, label(labels, "help", "Help"))
        .item(&updates_item)
        .separator()
        .item(&whats_new_item)
        .item(&about_item)
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&help_menu)
        .build()?;
    Ok(menu)
}

#[tauri::command]
fn set_menu_labels(
    app: AppHandle,
    state: tauri::State<MenuLabels>,
    labels: HashMap<String, String>,
) -> Result<(), String> {
    let menu = build_menu(&app, &labels).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = labels;
    Ok(())
}

// ─── Text writer (Story Builder) ─────────────────────────────────────────────
// Prompts and validation live in text_writer/; the key never leaves Rust.

#[tauri::command]
fn text_writer_set_key(provider: Provider, key: String) -> Result<(), WriterError> {
    text_writer::set_key(provider, &key)
}

#[tauri::command]
fn text_writer_has_key(provider: Provider) -> bool {
    text_writer::has_key(provider)
}

#[tauri::command]
fn text_writer_clear_key(provider: Provider) -> Result<(), WriterError> {
    text_writer::clear_key(provider)
}

/// Progress lines for the UI while a text request runs.
fn writer_status(app: &tauri::AppHandle) -> impl Fn(&str) + Sync + '_ {
    move |s: &str| {
        let _ = app.emit("text-writer-status", s);
    }
}

/// Which model will be used (looked up in the service's model list).
#[tauri::command]
async fn text_writer_check(app: tauri::AppHandle, provider: Provider) -> Result<String, WriterError> {
    text_writer::check(provider, &writer_status(&app)).await
}

#[tauri::command]
async fn text_writer_test(app: tauri::AppHandle, provider: Provider) -> Result<String, WriterError> {
    text_writer::test(provider, &writer_status(&app)).await
}

#[tauri::command]
async fn text_writer_generate(
    app: tauri::AppHandle,
    provider: Provider,
    requests: Vec<TextRequest>,
) -> Result<Vec<GeneratedText>, WriterError> {
    text_writer::generate(provider, requests, &writer_status(&app)).await
}

#[tauri::command]
async fn story_import(
    app: tauri::AppHandle,
    provider: Provider,
    text: String,
    lang: String,
) -> Result<StoryDraft, WriterError> {
    text_writer::import_story(provider, &text, &lang, &writer_status(&app)).await
}

/// The game's install folder (see game_dir.rs), or None when not found.
#[tauri::command]
fn detect_game_dir() -> Option<String> {
    game_dir::detect().map(|d| d.to_string_lossy().into_owned())
}

// ─── Thumbnail extraction ────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ThumbnailProgress {
    pub done: u32,
    pub total: u32,
    pub current: String,
}

#[derive(serde::Serialize)]
pub struct ThumbnailResult {
    pub saved: u32,
    pub missing: Vec<String>,
}

/// Spawn the extract_thumbnails sidecar and stream progress events to the
/// frontend. The sidecar writes one JSON line per event to stdout:
///   {"type":"progress","done":N,"total":M,"current":"icon_name"}
///   {"type":"done","saved":N,"missing":["..."]}
///   {"type":"error","message":"..."}
#[tauri::command]
async fn extract_thumbnails(
    app: tauri::AppHandle,
    game_dir: String,
    output_dir: String,
    icons: Vec<String>,
    map_object_icons: Vec<String>,
) -> Result<ThumbnailResult, String> {
    use tauri_plugin_shell::ShellExt;
    use std::io::Write;

    // Write icon lists to temp files instead of passing them as CLI arguments.
    // On Windows the joined comma-separated string easily exceeds the 32 767-char
    // CreateProcess command-line limit (OS error 206 / ERROR_FILENAME_EXCED_RANGE).
    let icons_json = serde_json::to_string(&icons)
        .map_err(|e| format!("failed to serialize icons: {e}"))?;
    let map_obj_json = serde_json::to_string(&map_object_icons)
        .map_err(|e| format!("failed to serialize map_object_icons: {e}"))?;

    let mut icons_file = tempfile::Builder::new()
        .prefix("oe-icons-")
        .suffix(".json")
        .tempfile()
        .map_err(|e| format!("failed to create icons temp file: {e}"))?;
    icons_file.write_all(icons_json.as_bytes())
        .map_err(|e| format!("failed to write icons temp file: {e}"))?;
    icons_file.flush()
        .map_err(|e| format!("failed to flush icons temp file: {e}"))?;

    let mut map_obj_file = tempfile::Builder::new()
        .prefix("oe-map-obj-icons-")
        .suffix(".json")
        .tempfile()
        .map_err(|e| format!("failed to create map-object-icons temp file: {e}"))?;
    map_obj_file.write_all(map_obj_json.as_bytes())
        .map_err(|e| format!("failed to write map-object-icons temp file: {e}"))?;
    map_obj_file.flush()
        .map_err(|e| format!("failed to flush map-object-icons temp file: {e}"))?;

    let icons_path = icons_file.path().to_string_lossy().into_owned();
    let map_obj_path = map_obj_file.path().to_string_lossy().into_owned();

    let (mut rx, _child) = app
        .shell()
        .sidecar("extract_thumbnails")
        .map_err(|e| format!("failed to find sidecar: {e}"))?
        .args([
            "--game-dir",
            &game_dir,
            "--output-dir",
            &output_dir,
            "--icons-file",
            &icons_path,
            "--map-object-icons-file",
            &map_obj_path,
        ])
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar: {e}"))?;

    // Temp files are kept alive until end of scope (dropped after sidecar finishes).

    let mut last_result: Option<ThumbnailResult> = None;

    while let Some(event) = rx.recv().await {
        use tauri_plugin_shell::process::CommandEvent;
        match event {
            CommandEvent::Stdout(line) => {
                let text = String::from_utf8_lossy(&line);
                let Ok(val) = serde_json::from_str::<serde_json::Value>(text.trim()) else {
                    continue;
                };
                match val.get("type").and_then(|t| t.as_str()) {
                    Some("progress") => {
                        let progress = ThumbnailProgress {
                            done: val["done"].as_u64().unwrap_or(0) as u32,
                            total: val["total"].as_u64().unwrap_or(0) as u32,
                            current: val["current"]
                                .as_str()
                                .unwrap_or("")
                                .to_string(),
                        };
                        app.emit("thumbnail-progress", &progress).ok();
                    }
                    Some("done") => {
                        last_result = Some(ThumbnailResult {
                            saved: val["saved"].as_u64().unwrap_or(0) as u32,
                            missing: val["missing"]
                                .as_array()
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|v| v.as_str().map(str::to_string))
                                        .collect()
                                })
                                .unwrap_or_default(),
                        });
                    }
                    Some("error") => {
                        let msg = val["message"].as_str().unwrap_or("unknown error").to_string();
                        return Err(msg);
                    }
                    _ => {}
                }
            }
            CommandEvent::Stderr(line) => {
                // Log stderr but don't fail — PyInstaller emits warnings there
                let text = String::from_utf8_lossy(&line);
                log::warn!("sidecar stderr: {}", text.trim());
            }
            CommandEvent::Error(e) => {
                return Err(format!("sidecar error: {e}"));
            }
            CommandEvent::Terminated(status) => {
                if let Some(code) = status.code {
                    if code != 0 {
                        return Err(format!("sidecar exited with code {code}"));
                    }
                }
                break;
            }
            _ => {}
        }
    }

    last_result.ok_or_else(|| "sidecar exited without reporting a result".to_string())
}

// ─── Object meshes (input of the in-app object renderer) ─────────────────────

/// The running mesh export, so the job's Cancel can stop it instead of letting it finish unseen.
static MESH_CHILD: std::sync::Mutex<Option<tauri_plugin_shell::process::CommandChild>> = std::sync::Mutex::new(None);

/// Run the sidecar in `list-objects` or `export-meshes` mode. Every `object` / `warning` line it prints is forwarded as
/// a `mesh-event`; the returned value is the `objects` line (list) or `{"type":"done"}` (export).
#[tauri::command]
async fn object_meshes(
    app: tauri::AppHandle,
    mode: String,
    game_dir: String,
    output_dir: String,
    sids: Vec<String>,
) -> Result<serde_json::Value, String> {
    use std::io::Write;
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    if mode != "list-objects" && mode != "export-meshes" {
        return Err(format!("unknown mode {mode}"));
    }
    let mut sids_file = tempfile::Builder::new()
        .prefix("oe-sids-")
        .suffix(".json")
        .tempfile()
        .map_err(|e| format!("failed to create sids temp file: {e}"))?;
    sids_file
        .write_all(serde_json::to_string(&sids).map_err(|e| e.to_string())?.as_bytes())
        .and_then(|_| sids_file.flush())
        .map_err(|e| format!("failed to write sids temp file: {e}"))?;
    let sids_path = sids_file.path().to_string_lossy().into_owned();

    let (mut rx, child) = app
        .shell()
        .sidecar("extract_thumbnails")
        .map_err(|e| format!("failed to find sidecar: {e}"))?
        .args([
            "--mode",
            &mode,
            "--game-dir",
            &game_dir,
            "--output-dir",
            &output_dir,
            "--sids-file",
            &sids_path,
        ])
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar: {e}"))?;

    *MESH_CHILD.lock().unwrap() = Some(child);
    let mut result: Option<serde_json::Value> = None;
    let outcome: Result<(), String> = async {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    let Ok(val) = serde_json::from_str::<serde_json::Value>(text.trim()) else {
                        continue;
                    };
                    match val.get("type").and_then(|t| t.as_str()) {
                        Some("object") | Some("warning") => {
                            app.emit("mesh-event", &val).ok();
                        }
                        Some("objects") | Some("done") => result = Some(val),
                        Some("error") => {
                            return Err(val["message"].as_str().unwrap_or("unknown error").to_string());
                        }
                        _ => {}
                    }
                }
                CommandEvent::Stderr(line) => {
                    log::warn!("sidecar stderr: {}", String::from_utf8_lossy(&line).trim());
                }
                CommandEvent::Error(e) => return Err(format!("sidecar error: {e}")),
                CommandEvent::Terminated(status) => {
                    if status.code.is_some_and(|c| c != 0) {
                        return Err(format!("sidecar exited with code {}", status.code.unwrap_or(-1)));
                    }
                    break;
                }
                _ => {}
            }
        }
        Ok(())
    }
    .await;
    *MESH_CHILD.lock().unwrap() = None;
    outcome?;
    result.ok_or_else(|| "sidecar exited without reporting a result".to_string())
}

/// Stop the running mesh export (the job's Cancel).
#[tauri::command]
fn cancel_object_meshes() {
    if let Some(child) = MESH_CHILD.lock().unwrap().take() {
        child.kill().ok();
    }
}

// ─── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Installer helper: report the game folder and exit before any window starts.
    if game_dir::handle_cli() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new()
            .level(log::LevelFilter::Info)
            .max_file_size(5_000_000) // 5 MB per file
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
            .build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            extract_thumbnails,
            object_meshes,
            cancel_object_meshes,
            detect_game_dir,
            text_writer_set_key,
            text_writer_has_key,
            text_writer_clear_key,
            text_writer_check,
            text_writer_test,
            text_writer_generate,
            story_import,
            set_recent_files,
            set_menu_labels
        ])
        .setup(|app| {
            // ── Auto-update (desktop only) ───────────────────────────────────
            // The frontend drives the check and install via the JS API; this only
            // registers the plugin. See src/lib/updater.ts.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // ── CLI mode (headless RMG for the GME mod, issue #258) ──────────
            // The main window starts hidden (tauri.conf.json) so a normal launch
            // never depends on JS to reveal it; shown here instead — small and
            // centered for a --generate run, normal size otherwise.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                use tauri_plugin_cli::CliExt;
                app.handle().plugin(tauri_plugin_cli::init())?;
                let matches = app.cli().matches().ok();
                let generate = matches
                    .as_ref()
                    .map_or(false, |m| m.args.get("generate").map_or(false, |a| a.occurrences > 0));
                // --progress <file>: the caller (the GME mod) shows the progress
                // itself, so no window is shown at all. A second top-level window
                // takes the focus from a fullscreen game, and over exclusive
                // fullscreen it can't be drawn on top either.
                let windowless = generate
                    && matches.as_ref().map_or(false, |m| {
                        m.args
                            .get("progress")
                            .and_then(|a| a.value.as_str())
                            .map_or(false, |path| !path.trim().is_empty())
                    });
                if let Some(window) = app.get_webview_window("main") {
                    if generate {
                        let _ = window.set_min_size(None::<tauri::LogicalSize<f64>>);
                        let _ = window.set_size(tauri::LogicalSize::new(460.0, 150.0));
                        let _ = window.set_title("Generating map…");
                        let _ = window.center();
                    }
                    if !windowless {
                        // A visible generate window (manual run, or the mod
                        // without --progress): topmost and focused so it at
                        // least covers a borderless game.
                        if generate {
                            let _ = window.set_always_on_top(true);
                        }
                        let _ = window.show();
                        // The window is created unfocused (tauri.conf.json), so
                        // that a hidden --generate --progress run never takes the
                        // foreground from a fullscreen game; focus it when shown.
                        let _ = window.set_focus();
                    }
                }
            }

            // ── Native menu bar ──────────────────────────────────────────────
            // Built with English labels; the frontend sends the UI-language ones through set_menu_labels once it has loaded.
            app.manage(RecentMenu(Mutex::new(None)));
            app.manage(MenuLabels(Mutex::new(HashMap::new())));
            let menu = build_menu(app.handle(), &HashMap::new())?;
            app.set_menu(menu)?;

            // Relay menu events to the frontend via a custom event
            let handle = app.handle().clone();
            app.on_menu_event(move |_app, event| {
                handle
                    .emit("menu-action", event.id().as_ref().to_string())
                    .ok();
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
