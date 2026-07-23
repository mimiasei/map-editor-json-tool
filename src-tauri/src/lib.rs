use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter,
};

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

// ─── App entry point ─────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
        .invoke_handler(tauri::generate_handler![extract_thumbnails])
        .setup(|app| {

            // ── Native menu bar ──────────────────────────────────────────────
            let new_item = MenuItemBuilder::with_id("new", "New")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let open_item = MenuItemBuilder::with_id("open", "Open...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?;
            let save_item = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(app)?;
            let save_as_item = MenuItemBuilder::with_id("save-as", "Save As...")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?;
            let quit_item = PredefinedMenuItem::quit(app, None)?;

            let file_menu = SubmenuBuilder::new(app, "File")
                .item(&new_item)
                .item(&open_item)
                .separator()
                .item(&save_item)
                .item(&save_as_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let undo_item = MenuItemBuilder::with_id("undo", "Undo")
                .accelerator("CmdOrCtrl+Z")
                .build(app)?;
            let redo_item = MenuItemBuilder::with_id("redo", "Redo")
                .accelerator("CmdOrCtrl+Shift+Z")
                .build(app)?;

            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .item(&undo_item)
                .item(&redo_item)
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&file_menu)
                .item(&edit_menu)
                .build()?;

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
