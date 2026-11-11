"""Export the game's UI sprites for the optional Game skin (see src/lib/ui-skin.ts).

Writes <out>/<key>.png for every entry of SPRITES plus <out>/manifest.json:
    {"version": 4, "build": "<size>-<mtime>", "sprites": {key: {"w", "h", "border": [top, right, bottom, left]}}}
The border is in the exported image's pixels, in CSS `border-image-slice` order. Unity's `Sprite.m_Border`
is left/bottom/right/top, so it is reordered here and the frontend never has to know about Unity.

Several sprites share a name (`Background`, `Frame_Backdrop_Strip` x4, ...), so every entry also pins the sprite's
size in the game. Sizes are the drawn image sizes of the shipped sprites (v1.0 data, Nov 2026).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

# key -> (Unity sprite name, width, height, scale[, border]). `scale` shrinks sprites authored far larger than they are shown.
# `border` (top, right, bottom, left, in the exported image's pixels) replaces the sprite's own when it has none (Dropdown_back)
# or when the authored one is the wrong size for how the sprite is used (Window_ModalWindow).
SPRITES: dict[str, tuple] = {
    "modal_frame": ("Window_ModalWindow_Frame_NoHighlight", 394, 394, 1.0),
    # The game's pill buttons (Cancel / Continue): one 3-slice sprite each. The bronze ones carry a border of 133, which is wider
    # than their rounded ends (45 of 79 px, like the green ones), so it is overridden.
    "button": ("buttom", 457, 79, 1.0, (0, 45, 0, 45)),
    "button_hover": ("buttom_MouseOver", 457, 79, 1.0, (0, 45, 0, 45)),
    "button_green": ("buttom_green", 460, 79, 1.0),
    "button_green_hover": ("buttom_green_MouseOver", 460, 79, 1.0),
    "field": ("KeyField", 316, 76, 1.0),
    "field_hover": ("KeyField_MouseOver", 316, 76, 1.0),
    "card_hover": ("Card_Tultips_MouseOver_0", 440, 60, 1.0),
    "card_pressed": ("Card_Tultips_Pressed", 440, 60, 1.0),
    "tooltip": ("littlr_tooltip", 1024, 109, 0.5),
    # Added after comparing with the game's own settings, new-game and random-map screens (Nov 2026).
    "toggle_off": ("Checkbox_Off", 81, 64, 1.0),
    "toggle_on": ("Checkbox_On", 81, 68, 1.0),
    "dropdown_pill": ("Dropdown_Top", 256, 49, 1.0),
    "dropdown_list": ("Dropdown_back", 256, 216, 1.0, (20, 20, 20, 20)),
    "dropdown_chevron": ("Dropdown_arrow", 34, 21, 1.0),
    "tab_glow": ("Glow_Tab_Company_Selected", 440, 64, 1.0),
    "tab_marker": ("Tab_Underline_2", 57, 30, 1.0),
    "window": ("Window_ModalWindow", 1720, 816, 0.25, (26, 26, 26, 26)),
    "arrow_divider": ("Separators_Decor", 367, 17, 1.0),
    "map_slider_track": ("TemplateSetUp_MapSize_Progressbar_Back", 24, 24, 1.0),
    "map_slider_thumb": ("TemplateSetUp_MapSize_Progressbar_Holder_Hover", 30, 58, 1.0),
    "background": ("background_menu", 3840, 2160, 0.5),
    # The metallic frame with corner ornaments of the random-map screen (the 546x491 variant); the start-screen buttons use it.
    "frame": ("Frame_MapParameters", 546, 491, 0.5),
}


def export_ui(game_dir: Path, out_dir: Path, emit: Callable[[dict], None]) -> None:
    import UnityPy

    data_dir = game_dir / "HeroesOldenEra_Data"
    if not data_dir.is_dir():
        raise FileNotFoundError(f"HeroesOldenEra_Data not found at: {data_dir}")
    out_dir.mkdir(parents=True, exist_ok=True)

    wanted = {name for name, *_ in SPRITES.values()}
    sprites: dict[tuple[str, int, int], tuple[object, object]] = {}
    env = UnityPy.load(str(data_dir))
    for obj in env.objects:
        if obj.type.name != "Sprite":
            continue
        s = obj.read()
        if s.m_Name not in wanted:
            continue
        # The rendered size, not m_Rect: m_Rect includes transparent padding (buttom is 460x79 as a rect, 457x79 drawn),
        # and two Frame_MapParameters variants share one rect but draw at 546x491 and 546x515.
        img = s.image
        sprites.setdefault((s.m_Name, img.width, img.height), (s, img))

    manifest: dict[str, dict] = {}
    missing: list[str] = []
    total = len(SPRITES)
    for i, (key, (name, w, h, scale, *override)) in enumerate(SPRITES.items()):
        found = sprites.get((name, w, h))
        if found is None:
            missing.append(key)
            emit({"type": "progress", "done": i + 1, "total": total, "current": key})
            continue
        s, img = found
        b = s.m_Border
        # Unity: x=left, y=bottom, z=right, w=top  ->  CSS slice: top, right, bottom, left
        border = [b.w, b.z, b.y, b.x]
        if scale != 1.0:
            img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))))
            border = [v * scale for v in border]
        if override:
            border = list(override[0])
        img.save(out_dir / f"{key}.png")
        manifest[key] = {"w": img.width, "h": img.height, "border": [round(v, 2) for v in border]}
        emit({"type": "progress", "done": i + 1, "total": total, "current": key})

    # Re-extract when the game changes. There is no version file in the install, so use the main data file.
    ref = data_dir / "resources.assets"
    st = ref.stat() if ref.exists() else None
    build = f"{st.st_size}-{int(st.st_mtime)}" if st else "unknown"
    (out_dir / "manifest.json").write_text(
        json.dumps({"version": 4, "build": build, "sprites": manifest}, separators=(",", ":")), encoding="utf-8"
    )
    emit({"type": "done", "saved": len(manifest), "missing": missing})
