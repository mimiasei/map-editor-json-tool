"""Export the game's 3D prefabs for map objects to OBJ/MTL/PNG, for the in-app object renderer.

Used by extract_thumbnails.py (`--mode list-objects` / `--mode export-meshes`). Only meshes and the textures they use
are written; nothing here is committed or shipped, it goes to the user's app data folder from their own install.

Which objects exist comes from Core.zip (DB/map/objects/*.json); each one's prefab is looked up by its `prefs[0]` path in
the ResourceManager container of resources.assets.
"""

from __future__ import annotations

import json
import re
import shutil
import zipfile
from pathlib import Path
from typing import Callable

# DB file -> (render job, prefab kind). Job "interactables" = the objects a map is built around, "decorations" = scenery.
_DB_FILES = (
    ("4_interactables.json", "interactables"),
    ("3_resources.json", "interactables"),
    ("6_artifacts.json", "interactables"),
    ("1_environments.json", "decorations"),
    ("2_animals.json", "decorations"),
)

# The game's cliff pieces (autotile set for the edges of raised ground), prefabs under cliffs/prefabs/ in the ResourceManager
# container (checked in the data: exactly these 21, each one cliff mesh on material matCliff1). They are not map objects, so
# they come from here and not from Core.zip; each is rendered like an object, with its origin at the tile centre.
_CLIFF_PIECES = (
    *(f"cliff_straight_{i:02d}" for i in range(8)),
    *(f"cliff_corner_{i:02d}" for i in range(3)),
    *(f"cliff_diagonal_{i:02d}" for i in range(3)),
    *(f"cliff_vertical_straight_{i:02d}" for i in range(4)),
    *(f"cliff_vertical_diagonal_{i:02d}" for i in range(3)),
)

# Animals that are only an animation variant of another one share its render (chicken_2 -> chicken_1); fish and birds are
# not land animals and are not drawn.
_ANIMAL_SKIP = re.compile(r"^(fish|birds(_\d+)?)$")

# Materials with these shaders are static geometry; anything else (water sheets, particles, portal glow) is an animated
# effect that cannot be drawn from a mesh.
_STATIC_SHADERS = ("Hex/Lit", "Hex/Environment")

# One frame (row 3, column 3 of the 128 px grid) of the game's fire flipbook, used as a sprite for the camp fire, whose
# flame is a shader particle in the game.
_FIRE_SHEET = "Fire_sheet_01_vfx"


def _core_zip(game_dir: Path) -> Path:
    return game_dir / "HeroesOldenEra_Data" / "StreamingAssets" / "Core.zip"


def list_objects(game_dir: Path) -> list[dict]:
    """Every object that gets a render: sid, job, prefab path, and the template's placement numbers."""
    out: list[dict] = []
    seen: set[str] = set()
    with zipfile.ZipFile(_core_zip(game_dir)) as z:
        for fname, job in _DB_FILES:
            raw = z.read(f"DB/map/objects/{fname}").decode("utf-8-sig")
            entries = json.loads(raw)["array"]
            ids = {t["id"] for t in entries}
            prefab_of = {t["id"]: t["prefs"][0] for t in entries if t.get("prefs")}
            for t in entries:
                sid = t["id"]
                # custom_<x> is a scripting wrapper of <x> with the same prefab: it shares its render.
                base = sid[len("custom_"):]
                if sid.startswith("custom_") and sid not in seen and t.get("prefs") and prefab_of.get(base) == t["prefs"][0]:
                    seen.add(sid)
                    out.append({"sid": sid, "job": job, "prefab": t["prefs"][0], "offsetX": 0, "offsetZ": 0, "rot": 0, "alias": base})
                    continue
                # custom_* are scripting wrappers around a base object, block* only block tiles, campaign ones are story props.
                if sid.startswith(("custom_", "block", "campaign_")) or sid.endswith("_campaign") or "_block_" in sid:
                    continue
                if fname == "2_animals.json" and _ANIMAL_SKIP.match(sid):
                    continue
                if sid in seen or not t.get("prefs"):
                    continue
                seen.add(sid)
                item = {
                    "sid": sid,
                    "job": job,
                    "prefab": t["prefs"][0],
                    "offsetX": t.get("offsetX", 0),
                    "offsetZ": t.get("offsetZ", 0),
                    # Animals face away from the camera in the prefab; 135 degrees turns them to a 3/4 view toward it.
                    "rot": 135 if fname == "2_animals.json" else 0,
                }
                m = re.match(r"^(.*)_(\d+)$", sid)
                if fname == "2_animals.json" and m and int(m.group(2)) > 1 and f"{m.group(1)}_1" in ids:
                    item["alias"] = f"{m.group(1)}_1"
                out.append(item)
    # The _e60 in the sids is the camera elevation these are rendered at (CLIFF_ELEVATION in lib/object-render/canvas-size.ts); a new
    # angle means new sids, so old renders count as missing and the new ones get made.
    # A piece faces one way (the wall lies on the north side of its tile, face toward the camera), so each one is rendered turned
    # to all four sides; the grid picks the turn that matches the edge.
    for name in _CLIFF_PIECES:
        for rot in (0, 90, 180, 270):
            out.append({"sid": f"{name}_r{rot}_e60", "job": "cliffs", "prefab": name, "key": f"cliffs/prefabs/{name}", "offsetX": 0, "offsetZ": 0, "rot": rot})
            # Where the face turns away from the camera the raised ground hides the wall and only its top shows (seen in game
            # screenshots), so walls also get a "top" render (no ground shadow): everything below 0.55 (walls are 0.67-0.72 tall) cut away.
            if not name.startswith("cliff_corner"):
                out.append({"sid": f"{name}_top_r{rot}_e60", "job": "cliffs", "prefab": name, "key": f"cliffs/prefabs/{name}", "offsetX": 0, "offsetZ": 0, "rot": rot, "cut": 0.55})
    return out


def export_meshes(game_dir: Path, out_root: Path, sids: list[str], emit: Callable[[dict], None]) -> None:
    import numpy as np
    from PIL import Image
    import UnityPy
    from UnityPy.helpers.MeshHelper import MeshHandler

    data_dir = game_dir / "HeroesOldenEra_Data"
    table = {o["sid"]: o for o in list_objects(game_dir)}
    todo = [table[s] for s in sids if s in table and "alias" not in table[s]]

    env = UnityPy.load(str(data_dir))
    objs = {}
    for o in env.objects:
        if o.assets_file and o.assets_file.name == "resources.assets":
            objs[o.path_id] = o
    cont: dict[str, int] = {}
    for o in env.objects:
        if o.type.name == "ResourceManager":
            for k, v in o.read().m_Container:
                # A key can appear twice (prefab + sprite with the same path); keep the GameObject.
                if v.path_id in objs and objs[v.path_id].type.name == "GameObject" or str(k) not in cont:
                    cont[str(k)] = v.path_id
    by_base: dict[str, list[int]] = {}
    for k, pid in cont.items():
        by_base.setdefault(k.rsplit("/", 1)[-1].lower(), []).append(pid)

    def quat_to_mat(q):
        x, y, z, w = q.x, q.y, q.z, q.w
        return np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0],
            [0, 0, 0, 1]])

    def trs(t):
        T = np.eye(4)
        T[:3, 3] = [t.m_LocalPosition.x, t.m_LocalPosition.y, t.m_LocalPosition.z]
        S = np.diag([t.m_LocalScale.x, t.m_LocalScale.y, t.m_LocalScale.z, 1.0])
        return T @ quat_to_mat(t.m_LocalRotation) @ S

    def array_slice(t, idx):
        """One slice of a Texture2DArray (Hex/Environment samples one, chosen by _MainTexIndex). The pixel data is in
        resources.assets.resS (m_StreamData) or inline in image_data. Format ids, checked by decoding and by size
        (slice = all mips = pixels*4/3 * bytes/pixel): 100 = BC3/DXT5 (1 byte/px), 96 = BC1/DXT1 (0.5 byte/px)."""
        import texture2ddecoder
        sd = t.m_StreamData
        w, h = t.m_Width, t.m_Height
        dec, bpp = {100: (texture2ddecoder.decode_bc3, 1.0), 96: (texture2ddecoder.decode_bc1, 0.5)}[t.m_Format]
        if sd and sd.path:
            with open(data_dir / sd.path, "rb") as f:
                f.seek(sd.offset + idx * (sd.size // t.m_Depth))
                data = f.read(int(w * h * bpp))
        else:
            length = len(t.image_data) // t.m_Depth
            data = bytes(t.image_data[idx * length:idx * length + int(w * h * bpp)])
        # Unity stores rows bottom-first; UnityPy flips normal Texture2D images the same way.
        return Image.frombytes("RGBA", (w, h), dec(data, w, h), "raw", "BGRA").transpose(Image.FLIP_TOP_BOTTOM)

    def shader_name(mat) -> str:
        return getattr(mat.m_Shader.read().m_ParsedForm, "m_Name", "?") if mat and mat.m_Shader else "?"

    def export(sid: str, key: str, outdir: Path) -> None:
        parts, mats_done = [], {}

        def walk(go_obj, parent):
            go = go_obj.read()
            if not go.m_IsActive:
                return
            tr = mf = mr = None
            for c in go.m_Component:
                p = c.component if hasattr(c, "component") else c[1]
                o = p.deref()
                t = o.type.name
                try:
                    if t == "Transform":
                        tr = o.read()
                    elif t == "MeshFilter":
                        mf = o.read()
                    elif t in ("MeshRenderer", "SkinnedMeshRenderer"):
                        mr = (t, o.read())
                except Exception:
                    pass
            M = parent @ trs(tr)
            # Skinned meshes are exported in their rest pose: with the rig at bind pose the vertices are just v in renderer space.
            mesh_ptr = mf.m_Mesh if mf is not None else (mr[1].m_Mesh if mr is not None and mr[0] == "SkinnedMeshRenderer" else None)
            if mr is not None and mr[1].m_Enabled and mesh_ptr:
                parts.append((go.m_Name, mesh_ptr.read(), [m.read() if m else None for m in mr[1].m_Materials], M))
            for ch in tr.m_Children:
                walk(ch.read().m_GameObject.deref(), M)

        def emissive_for(diffuse_name: str):
            base = diffuse_name.lower().replace("_diffuse", "").replace("_difusse", "").replace("_diff", "")
            for suffix in ("_emissive", "_emission", "_emm", "_emmisive"):
                for pid in by_base.get(base + suffix, []):
                    o = objs.get(pid)
                    if o is not None and o.type.name == "Texture2D":
                        return o.read()
            return None

        def save_material(mat) -> None:
            if mat.m_Name in mats_done:
                return
            sp = mat.m_SavedProperties
            tex = {k: v for k, v in sp.m_TexEnvs}
            info = {"name": mat.m_Name, "shader": shader_name(mat)}
            main = tex.get("_MainTex")
            main = main.m_Texture.read() if main and main.m_Texture else None
            fl = {k: v for k, v in sp.m_Floats}
            if main is not None:
                if main.object_reader.type.name == "Texture2DArray":
                    img = array_slice(main, int(fl.get("_MainTexIndex", 0)))
                else:
                    img = main.image.convert("RGBA")
                a = np.array(img)[..., 3]
                info["diffuse"] = main.m_Name
                info["alpha_min"] = int(a.min())
                # The alpha channel only means transparency for blended/cut-out materials; palaces etc. use it for something else.
                info["queue"] = int(mat.m_CustomRenderQueue)
                for k in ("_Mode", "_RenderMode", "_AlphaClipEnabled", "_SrcBlend", "_DstBlend", "_ZWrite", "_Cutoff"):
                    if k in fl:
                        info[k] = round(float(fl[k]), 3)
                # Hex/Environment discards by texture alpha whatever its clip flag says (reeds, weeds and leaf sheets have
                # transparent padding).
                if info["shader"] == "Hex/Environment" and info["alpha_min"] < 255:
                    info["queue"], info["_AlphaClipEnabled"] = 2450, 1.0
                    info["_Cutoff"] = round(float(fl.get("_AlphaCutoff", fl.get("_Cutoff", 0.5))), 3)
                img.convert("RGB").save(outdir / f"{mat.m_Name}_diffuse.png")
                if info["alpha_min"] < 255:
                    img.getchannel("A").save(outdir / f"{mat.m_Name}_alpha.png")
                e = tex.get("_EmissionTex")
                e = e.m_Texture.read() if e and e.m_Texture else emissive_for(main.m_Name)
                if e is not None and e.object_reader.type.name == "Texture2D":
                    e.image.convert("RGB").save(outdir / f"{mat.m_Name}_emissive.png")
                    info["emissive"] = e.m_Name
            mats_done[mat.m_Name] = info

        outdir.mkdir(parents=True, exist_ok=True)
        walk(objs[cont[key]], np.eye(4))
        lines, vbase, allv = ["mtllib model.mtl\n"], 0, []
        for name, mesh, mats, M in parts:
            det = float(np.linalg.det(M[:3, :3]))
            mat_names = " ".join(m.m_Name.lower() for m in mats if m)
            # Terrain plates / ground decals under towns and cities (the grid draws its own terrain), and parts with a
            # zero scale (invisible in-game).
            if re.search(r"(^|[_ .])ground(|_|$)", name.lower()) or name.lower() == "quad" or "decal" in mat_names or abs(det) < 1e-20:
                continue
            shaders = [shader_name(m) for m in mats]
            if shaders and all(s not in _STATIC_SHADERS for s in shaders):
                continue
            flip = det < 0  # mirrored part: its winding is inverted
            h = MeshHandler(mesh)
            h.process()
            V = np.array(h.m_Vertices, dtype=float).reshape(len(h.m_Vertices), -1)[:, :3]
            Vw = (M @ np.c_[V, np.ones(len(V))].T).T[:, :3]
            N = np.array(h.m_Normals, dtype=float).reshape(len(h.m_Normals), -1)[:, :3] if h.m_Normals else None
            Nw = (np.linalg.inv(M[:3, :3]).T @ N.T).T if N is not None else None
            lines.append(f"o {name}\n")
            # Unity is left-handed: mirror x so the model is right-handed for three.js.
            lines += [f"v {-x:.6f} {y:.6f} {z:.6f}\n" for x, y, z in Vw]
            allv.append(Vw * [-1, 1, 1])
            if h.m_UV0:
                lines += [f"vt {u[0]:.6f} {u[1]:.6f}\n" for u in h.m_UV0]
            if Nw is not None:
                lines += [f"vn {-x:.6f} {y:.6f} {z:.6f}\n" for x, y, z in Nw]
            for i, tris in enumerate(h.get_triangles()):
                mat = mats[i] if i < len(mats) else None
                if mat:
                    save_material(mat)
                    lines.append(f"usemtl {mat.m_Name}\n")
                for a, b, c in tris:
                    f = lambda k: f"{k + 1 + vbase}/{k + 1 + vbase}/{k + 1 + vbase}"
                    lines.append(f"f {f(a)} {f(b)} {f(c)}\n" if flip else f"f {f(c)} {f(b)} {f(a)}\n")
            vbase += len(V)
        if not allv:
            raise ValueError("no static geometry")
        (outdir / "model.obj").write_text("".join(lines))
        with open(outdir / "model.mtl", "w") as f:
            for n in mats_done:
                f.write(f"newmtl {n}\nKd 1 1 1\nmap_Kd {n}_diffuse.png\n\n")
        A = np.vstack(allv)
        meta = {"sid": sid, "key": key, "materials": mats_done,
                "bbox_min": A.min(0).round(3).tolist(), "bbox_max": A.max(0).round(3).tolist()}
        (outdir / "meta.json").write_text(json.dumps(meta))

    def fire_sprite() -> None:
        """Flame sprite with alpha from one flipbook frame: black = transparent, brighter = more opaque."""
        for pid in by_base.get(_FIRE_SHEET.lower(), []):
            o = objs.get(pid)
            if o is None or o.type.name != "Texture2D":
                continue
            frame = 128
            r, c = 3, 3
            fr = np.asarray(o.read().image.convert("RGB").crop((c * frame, r * frame, (c + 1) * frame, (r + 1) * frame)), dtype=np.float32) / 255
            a = np.clip(fr.max(axis=2) * 1.6, 0, 1)
            rgb = np.where(a[..., None] > 1e-3, fr / np.maximum(fr.max(axis=2, keepdims=True), 1e-3), 0)
            out = Image.fromarray((np.dstack([np.clip(rgb, 0, 1), a]) * 255).astype(np.uint8), "RGBA")
            bb = Image.fromarray((np.asarray(out)[..., 3] > 20).astype(np.uint8) * 255).getbbox()
            out = out.crop(bb)
            out.resize((out.size[0] * 4, out.size[1] * 4), Image.LANCZOS).save(out_root / "fire_sprite.png")
            return

    out_root.mkdir(parents=True, exist_ok=True)
    if any(o["sid"] == "camp_fire" for o in todo):
        fire_sprite()
    for n, o in enumerate(todo, 1):
        key = o.get("key") or "objects/" + o["prefab"].lower()
        status = "ok"
        if key not in cont:
            status = "missing"
        else:
            try:
                export(o["sid"], key, out_root / o["sid"])
            except Exception as exc:  # one broken prefab must not stop the rest
                shutil.rmtree(out_root / o["sid"], ignore_errors=True)
                if isinstance(exc, ValueError):
                    status = "missing"  # no static geometry (ground decals, effects)
                else:
                    status = "error"
                    emit({"type": "warning", "sid": o["sid"], "message": f"{type(exc).__name__}: {exc}"})
        emit({"type": "object", "sid": o["sid"], "status": status, "done": n, "total": len(todo)})
