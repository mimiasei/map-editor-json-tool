# Plan: Issue #62 — Extract Game Asset Thumbnails

**Branch:** `feat/62-thumbnail-extraction`  
**Depends on:** #60 (Game Data Catalog — provides `icon` SIDs, `thumbnailPath()` stub, `CatalogIcon`)

---

## Background

Game entity icons live in Unity binary asset bundles under `HeroesOldenEra_Data/` in the
game install — not inside `Core.zip`. This plan covers extracting them as PNGs, activating
the existing thumbnail stubs, and integrating icons tastefully into the catalog dropdowns.

The reference implementation (ignis-sec/HoMM-OE-Template-Editor `services/game_assets.py`)
has already solved the hard problems:
- UnityPy loads the entire `HeroesOldenEra_Data/` directory in a single pass
- Name matching is case-insensitive; output filenames are always lowercase
- Disambiguation: prefer `m_TextureFormat == 12` (BC7 hi-res) for most assets;
  prefer `image.size == (64, 64)` for map object icons to avoid atlas textures

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri Desktop App                                              │
│                                                                 │
│  ┌──────────────────┐  invoke   ┌──────────────────────────┐   │
│  │  React frontend  │──────────▶│  Rust command             │   │
│  │  (extract dialog)│◀──────────│  extract_thumbnails()     │   │
│  │                  │  events   │       │ spawn              │   │
│  └──────────────────┘           │       ▼                   │   │
│                                 │  Python sidecar binary    │   │
│                                 │  (PyInstaller + UnityPy)  │   │
│                                 └──────────────────────────┘   │
│                                                                 │
│  Output: AppLocalData/thumbnails/{iconId}.png                   │
│          AppLocalData/thumbnails/manifest.json                  │
│  Consumed by: thumbnailPath() → CatalogIcon → EntityCombobox   │
└─────────────────────────────────────────────────────────────────┘
```

**Web build:** No changes. `thumbnailPath()` always returns `null` in the browser.
**Tauri build:** Full pipeline active.

---

## Files Changed / Created

### New files

| File | Purpose |
|------|---------|
| `PLAN-62.md` | This document |
| `src-tauri/sidecar/extract_thumbnails.py` | Python extractor script (compiled to binary) |
| `scripts/build-sidecar.sh` | Helper to compile the sidecar with PyInstaller |
| `src/components/common/ThumbnailExtractDialog.tsx` | UI dialog for extraction progress |
| `src/hooks/useThumbnailManifest.ts` | Hook that loads/caches the manifest JSON |

### Modified files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-shell` |
| `src-tauri/tauri.conf.json` | Add `bundle.externalBin` for sidecar |
| `src-tauri/capabilities/default.json` | Add shell:execute-sidecar permission |
| `src-tauri/src/lib.rs` | Register `extract_thumbnails` command and shell plugin |
| `src/lib/catalog/thumbnails.tsx` | Activate `thumbnailPath()` using manifest |
| `src/components/common/EntityCombobox.tsx` | Add `<CatalogIcon>` to each list item |
| `src/components/layout/Toolbar.tsx` | Add "Extract Thumbnails…" to More dropdown |

---

## 1. Python Extractor Sidecar

**File:** `src-tauri/sidecar/extract_thumbnails.py`

**CLI interface:**
```
extract_thumbnails \
  --game-dir   /path/to/HeroesOldenEra install \
  --output-dir /path/to/AppLocalData/thumbnails \
  --icons      icon1,icon2,icon3,... \
  [--map-object-icons  icon4,icon5,...]
```

**Stdout protocol (one JSON object per line):**
```json
{"type": "progress", "done": 12, "total": 500, "current": "artifact_sword_of_healing"}
{"type": "done", "saved": 487, "missing": ["some_icon"]}
{"type": "error", "message": "HeroesOldenEra_Data not found at path"}
```

**Extraction rules:**
- All icons: single `UnityPy.load(data_dir)` pass, case-insensitive name match
- Default picker: prefer `m_TextureFormat == 12` (BC7) when duplicates exist
- Map object icons: prefer `image.size == (64, 64)` instead
- Writes `{output_dir}/{icon_name_lower}.png`
- Writes `{output_dir}/manifest.json` on completion: `["icon1", "icon2", ...]`
- Exit 0 on success, 1 on error

**PyInstaller build:**
```bash
pip install pyinstaller unitypy pillow
pyinstaller --onefile --name extract_thumbnails-x86_64-pc-windows-msvc \
            src-tauri/sidecar/extract_thumbnails.py
```

Platform naming follows Tauri sidecar convention:
- Windows: `extract_thumbnails-x86_64-pc-windows-msvc.exe`
- Linux:   `extract_thumbnails-x86_64-unknown-linux-gnu`
- macOS:   `extract_thumbnails-aarch64-apple-darwin`

---

## 2. Tauri Sidecar Registration

**`src-tauri/tauri.conf.json`** — add:
```json
"bundle": {
  "externalBin": ["sidecar/extract_thumbnails"]
}
```

**`src-tauri/Cargo.toml`** — add:
```toml
tauri-plugin-shell = "2"
```

**`src-tauri/capabilities/default.json`** — add:
```json
"shell:allow-extract-thumbnails-sidecar"
```

**`src-tauri/src/lib.rs`** — register plugin and command:
```rust
.plugin(tauri_plugin_shell::init())
.invoke_handler(tauri::generate_handler![extract_thumbnails])
```

---

## 3. Rust Command

**File:** inline in `src-tauri/src/lib.rs`

```rust
#[derive(serde::Serialize, Clone)]
struct ThumbnailProgress { done: u32, total: u32, current: String }

#[derive(serde::Serialize)]
struct ThumbnailResult { saved: u32, missing: Vec<String> }

#[tauri::command]
async fn extract_thumbnails(
    app: tauri::AppHandle,
    game_dir: String,
    output_dir: String,
    icons: Vec<String>,
    map_object_icons: Vec<String>,
) -> Result<ThumbnailResult, String>
```

- Spawns the sidecar with `tauri_plugin_shell::process::Command`
- Reads stdout line-by-line
- On `type=progress`: emits Tauri event `thumbnail-progress` to frontend
- On `type=done`: returns `ThumbnailResult`
- On `type=error` or non-zero exit: returns `Err(message)`

---

## 4. thumbnailPath() Activation

**Strategy:** Manifest file approach (synchronous lookup, no async in render path).

On app start (or after extraction), load `AppLocalData/thumbnails/manifest.json` into a
`Set<string>`. `thumbnailPath(iconId)` checks the set; if present, returns the
`asset://` URL.

**`src/hooks/useThumbnailManifest.ts`** — Zustand-like module:
```typescript
// Singleton set of known icon IDs loaded from manifest.json
let knownIcons: Set<string> | null = null

export async function loadThumbnailManifest(): Promise<void>
export function isIconKnown(iconId: string): boolean
```

**`src/lib/catalog/thumbnails.tsx`** — update `thumbnailPath`:
```typescript
export function thumbnailPath(iconId: string | undefined): string | null {
  if (!iconId || !isTauri()) return null
  if (!isIconKnown(iconId.toLowerCase())) return null
  return convertFileSrc(`${thumbnailDir()}/${iconId.toLowerCase()}.png`)
}
```

`thumbnailDir()` resolves to `AppLocalData/thumbnails/` using `@tauri-apps/api/path`.
Called once on app init and cached.

---

## 5. ThumbnailExtractDialog

**File:** `src/components/common/ThumbnailExtractDialog.tsx`

**States:**
1. **Idle** — "Pick game install folder" button + auto-detect notice
2. **Running** — progress bar (done/total), current icon name, cancel button
3. **Done** — "Extracted N icons. M not found." + Close

**Trigger points:**
- "More" dropdown → "Extract Thumbnails…" (always available in Tauri)
- After catalog build success, if no manifest exists: toast notification with
  "Extract thumbnails?" link (one-time, dismissible, stored in localStorage)

---

## 6. EntityCombobox Icon Integration

**Change:** Add `<CatalogIcon size={16} />` as the first child of each `CommandItem`.

```tsx
<CommandItem className="flex items-center gap-2 text-sm">
  <CatalogIcon iconId={entry.icon} name={entry.label} size={16} />
  <span className="truncate flex-1">{entry.label}</span>
  <span className="ml-auto text-xs text-muted-foreground font-mono truncate max-w-[40%]">
    {entry.id}
  </span>
</CommandItem>
```

Also add the icon to the **closed/selected state** button, so the currently-selected
entity is identified visually without opening the dropdown.

**Where icons are NOT added:**
- `SidCombobox` — user-defined SIDs, no game art
- Tree sidebar — already dense, text-only is correct
- JSON preview — data view, not a UI
- Validation dialog — information view

---

## 7. UX Principles

- **16×16 in dropdown rows** — does not increase row height, scannable not noisy
- **`CatalogIcon` letter-badge fallback** — layout is stable before/without thumbnails
- **No icons in tree, JSON, or validation** — those are data views
- **Hover detail card** — deferred to a future issue; keep #62 focused on extraction
- **First-run prompt** — one-time toast, never intrusive, stored in localStorage

---

## 8. Open Decisions

| # | Decision | Resolution |
|---|----------|-----------|
| 1 | Ship pre-built sidecar or require build? | Document build process; pre-built binaries in CI releases |
| 2 | Acceptable sidecar binary size (~30–50 MB)? | Yes for desktop app |
| 3 | Persist game install path? | Yes — `localStorage` key `oe-game-dir` |
| 4 | Re-extraction idempotent? | Yes — always overwrites PNGs |
| 5 | Progress reporting mechanism | Stdout JSON lines → Tauri event |
| 6 | macOS universal binary? | Ship aarch64 + x86_64 as separate named sidecars |

---

## 9. What Is NOT in Scope

- Compiling or shipping sidecar binaries (done in CI / user build step)
- Hover card detail panel (future issue)
- Icons in SidCombobox, tree, JSON preview, or validation
- Web build changes (none needed)
