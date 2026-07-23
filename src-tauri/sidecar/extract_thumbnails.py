#!/usr/bin/env python3
"""Extract game asset thumbnails from Heroes of Might and Magic: Olden Era.

Usage:
    extract_thumbnails \\
        --game-dir   /path/to/game/install \\
        --output-dir /path/to/output \\
        --icons      icon1,icon2,icon3 \\
        [--map-object-icons icon4,icon5]

Stdout protocol (one JSON object per line):
    {"type": "progress", "done": 12, "total": 500, "current": "icon_name"}
    {"type": "done", "saved": 487, "missing": ["icon_name"]}
    {"type": "error", "message": "..."}

Exit 0 on success, 1 on error.

Build to sidecar binary with PyInstaller:
    pip install pyinstaller unitypy pillow
    pyinstaller --onefile --name extract_thumbnails-<target-triple> extract_thumbnails.py

Target triple naming follows Tauri sidecar conventions:
    Windows : extract_thumbnails-x86_64-pc-windows-msvc.exe
    Linux   : extract_thumbnails-x86_64-unknown-linux-gnu
    macOS   : extract_thumbnails-aarch64-apple-darwin
              extract_thumbnails-x86_64-apple-darwin
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Final

# Unity Texture2D format value for BC7 hi-res textures used by Olden Era artifacts/spells.
# When a name has multiple candidates, the BC7 (fmt 12) texture is always the hi-res source.
# Verified against v1.0 game data (reference: ignis-sec/HoMM-OE-Template-Editor).
_BC7_FORMAT: Final[int] = 12

# Preferred size for map object icons — avoids large atlas textures sharing the same name.
_MAP_OBJECT_SIZE: Final[tuple[int, int]] = (64, 64)


def _emit(obj: dict) -> None:
    """Write a single JSON line to stdout, flushed immediately."""
    print(json.dumps(obj, separators=(",", ":")), flush=True)


def _pick_texture(
    options: list[tuple[int, object]],
    prefer_size: tuple[int, int] | None,
) -> object:
    """Pick the best Texture2D from a set of same-named candidates.

    Rules (in order):
      1. If prefer_size is set, pick the first candidate whose decoded image
         matches that size (used for map object 64×64 icons).
      2. Otherwise prefer m_TextureFormat == 12 (BC7 hi-res).
      3. Fall back to the first candidate.
    """
    if prefer_size is not None:
        for _fmt, data in options:
            try:
                if data.image.size == prefer_size:
                    return data
            except Exception:
                continue
        return options[0][1]

    bc7 = next((data for fmt, data in options if fmt == _BC7_FORMAT), None)
    return bc7 if bc7 is not None else options[0][1]


def extract(
    game_dir: Path,
    output_dir: Path,
    icons: list[str],
    map_object_icons: list[str],
) -> None:
    """Main extraction routine. Emits progress/done/error JSON lines to stdout."""
    try:
        import UnityPy  # type: ignore[import-untyped]
    except ImportError:
        _emit(
            {
                "type": "error",
                "message": "UnityPy is not installed. Run: pip install unitypy",
            }
        )
        sys.exit(1)

    data_dir = game_dir / "HeroesOldenEra_Data"
    if not data_dir.is_dir():
        _emit(
            {
                "type": "error",
                "message": f"HeroesOldenEra_Data not found at: {data_dir}",
            }
        )
        sys.exit(1)

    output_dir.mkdir(parents=True, exist_ok=True)

    # On Windows, prefix the output path with the extended-length path marker so
    # that icon names with long SIDs don't exceed the 260-character MAX_PATH limit.
    if sys.platform == "win32":
        output_dir = Path("\\\\?\\" + str(output_dir.resolve()))

    # Build lookup tables: lowercase → (original_spelling, prefer_size | None)
    wanted: dict[str, tuple[str, tuple[int, int] | None]] = {}
    for orig in icons:
        if orig:
            wanted.setdefault(orig.lower(), (orig, None))
    for orig in map_object_icons:
        if orig:
            wanted.setdefault(orig.lower(), (orig, _MAP_OBJECT_SIZE))

    if not wanted:
        _emit({"type": "done", "saved": 0, "missing": []})
        return

    total = len(wanted)

    # Single-pass scan of all Texture2D objects in the data directory.
    # Bucket by lowercase name; defer image decoding until after picking.
    candidates: dict[str, list[tuple[int, object]]] = {key: [] for key in wanted}

    env = UnityPy.load(str(data_dir))
    for obj in env.objects:
        if obj.type.name != "Texture2D":
            continue
        data = obj.read()
        name: str = getattr(data, "m_Name", None) or getattr(data, "name", None) or ""
        key = name.lower()
        if key not in candidates:
            continue
        fmt = getattr(data, "m_TextureFormat", -1)
        try:
            fmt_int = int(fmt)
        except (TypeError, ValueError):
            fmt_int = -1
        candidates[key].append((fmt_int, data))

    # Pick best candidate and save PNG for each wanted icon.
    saved = 0
    missing: list[str] = []

    for key, (orig, prefer_size) in sorted(wanted.items()):
        options = candidates.get(key, [])
        if not options:
            missing.append(orig)
            continue

        chosen = _pick_texture(options, prefer_size)
        try:
            image = chosen.image
        except Exception as exc:
            missing.append(orig)
            _emit(
                {
                    "type": "progress",
                    "done": saved,
                    "total": total,
                    "current": orig,
                    "warning": f"could not decode: {exc}",
                }
            )
            continue

        image.save(output_dir / f"{key}.png")
        saved += 1
        _emit({"type": "progress", "done": saved, "total": total, "current": key})

    # Write manifest so thumbnailPath() can do a synchronous existence check.
    manifest_path = output_dir / "manifest.json"
    existing_manifest: list[str] = []
    if manifest_path.exists():
        try:
            existing_manifest = json.loads(manifest_path.read_text())
        except Exception:
            pass
    # Precompute the lowercased missing set once to avoid O(n²) inside the comprehension.
    missing_set = {m.lower() for m in missing}
    all_known = sorted(
        set(existing_manifest) | {k for k in wanted if k not in missing_set}
    )
    manifest_path.write_text(json.dumps(all_known))

    _emit({"type": "done", "saved": saved, "missing": missing})


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract HoMM:OE asset thumbnails")
    parser.add_argument(
        "--game-dir", required=True, help="Path to game install directory"
    )
    parser.add_argument(
        "--output-dir", required=True, help="Directory to write PNG files"
    )
    parser.add_argument("--icons", default="", help="Comma-separated list of icon SIDs")
    parser.add_argument(
        "--map-object-icons",
        default="",
        help="Comma-separated icon SIDs for map objects (uses 64x64 size preference)",
    )
    parser.add_argument(
        "--icons-file",
        default="",
        help="Path to a JSON file containing a list of icon SIDs (alternative to --icons)",
    )
    parser.add_argument(
        "--map-object-icons-file",
        default="",
        help="Path to a JSON file containing map-object icon SIDs (alternative to --map-object-icons)",
    )
    args = parser.parse_args()

    game_dir = Path(args.game_dir)
    output_dir = Path(args.output_dir)

    if args.icons_file:
        icons = json.loads(Path(args.icons_file).read_text(encoding="utf-8"))
    else:
        icons = [i.strip() for i in args.icons.split(",") if i.strip()]

    if args.map_object_icons_file:
        map_object_icons = json.loads(
            Path(args.map_object_icons_file).read_text(encoding="utf-8")
        )
    else:
        map_object_icons = [
            i.strip() for i in args.map_object_icons.split(",") if i.strip()
        ]

    try:
        extract(game_dir, output_dir, icons, map_object_icons)
    except Exception as exc:
        _emit({"type": "error", "message": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()
