"""Export the game's UI sprites for the optional Game skin (see src/lib/ui-skin.ts).

Writes <out>/<key>.png for every entry of SPRITES plus <out>/manifest.json:
    {"version": 1, "build": "<size>-<mtime>", "sprites": {key: {"w", "h", "border": [top, right, bottom, left]}}}
The border is in the exported image's pixels, in CSS `border-image-slice` order. Unity's `Sprite.m_Border`
is left/bottom/right/top, so it is reordered here and the frontend never has to know about Unity.

Several sprites share a name (`Background`, `Frame_Backdrop_Strip` x4, ...), so every entry also pins the sprite's
size in the game. Sizes are the drawn image sizes of the shipped sprites (v1.0 data, Nov 2026).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

# key -> (Unity sprite name, width, height, scale). `scale` shrinks sprites authored far larger than they are shown.
SPRITES: dict[str, tuple[str, int, int, float]] = {
    "dialog_frame": ("Frame_MapParameters", 546, 491, 1.0),
    "modal_frame": ("Window_ModalWindow_Frame_NoHighlight", 394, 394, 1.0),
    "divider": ("Divider", 600, 20, 1.0),
    "button": ("buttom", 457, 79, 1.0),
    "button_hover": ("buttom_MouseOver", 457, 79, 1.0),
    "button_green_left": ("Button_Green_Left", 94, 80, 1.0),
    "button_green_left_hover": ("Button_Green_Left_MouseOver", 94, 80, 1.0),
    "button_green_center": ("Button_Green_Center", 276, 80, 1.0),
    "button_green_center_hover": ("Button_Green_Center_MouseOver", 276, 80, 1.0),
    "button_green_right": ("Button_Green_Right", 94, 80, 1.0),
    "button_green_right_hover": ("Button_Green_Right_MouseOver", 94, 80, 1.0),
    "field": ("KeyField", 316, 76, 1.0),
    "field_hover": ("KeyField_MouseOver", 316, 76, 1.0),
    "dropdown_frame": ("dropdown_frame", 315, 60, 1.0),
    "dropdown_open": ("dropdown_open", 315, 266, 1.0),
    "dropdown_arrow": ("Button_Dropdown_Down", 45, 45, 1.0),
    "dropdown_arrow_hover": ("Button_Dropdown_Down_MouseOver", 45, 45, 1.0),
    "card": ("Card_Tultips", 440, 60, 1.0),
    "card_hover": ("Card_Tultips_MouseOver_0", 440, 60, 1.0),
    "card_pressed": ("Card_Tultips_Pressed", 440, 60, 1.0),
    "tooltip": ("littlr_tooltip", 1024, 109, 0.5),
    "bar": ("Frame_Backdrop_Strip", 875, 60, 1.0),
    "scroll_track": ("scroll_background", 21, 340, 1.0),
    "scroll_thumb": ("scroll", 21, 342, 1.0),
    "slider_track": ("slider_empty_zone", 971, 33, 1.0),
    "slider_fill": ("slider_full_zone", 971, 33, 1.0),
    "tab": ("PlateTab_NotSelected", 551, 59, 1.0),
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
    for i, (key, (name, w, h, scale)) in enumerate(SPRITES.items()):
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
        img.save(out_dir / f"{key}.png")
        manifest[key] = {"w": img.width, "h": img.height, "border": [round(v, 2) for v in border]}
        emit({"type": "progress", "done": i + 1, "total": total, "current": key})

    # Re-extract when the game changes. There is no version file in the install, so use the main data file.
    ref = data_dir / "resources.assets"
    st = ref.stat() if ref.exists() else None
    build = f"{st.st_size}-{int(st.st_mtime)}" if st else "unknown"
    (out_dir / "manifest.json").write_text(
        json.dumps({"version": 1, "build": build, "sprites": manifest}, separators=(",", ":")), encoding="utf-8"
    )
    emit({"type": "done", "saved": len(manifest), "missing": missing})
