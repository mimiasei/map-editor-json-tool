# Issue #60 — Game Data Catalog from Core.zip

## Background

The editor currently uses hardcoded static lists in `src/schema/entities.ts` for heroes
(~110 entries), creatures (~170), artifacts (~160), and map objects (~130). These go
stale whenever the game updates, omit newly added entities, and cover only the subset
that was manually entered. Fields like spells, skills, and buffs have no dropdown
support at all — they are free-text only.

The game ships all its data as JSON files inside
`HeroesOldenEra_Data/StreamingAssets/Core.zip`. This file is a standard ZIP containing
a `DB/` tree of entity databases plus `Lang/english/` localization files. No binary
decoding or Unity-specific tooling is required — plain `jszip` (already a dependency)
can read it.

This feature adds a **Game Data Catalog**: a one-time extraction pass over `Core.zip`
that produces a structured in-memory catalog of all game entities relevant to the
quest/event editor: heroes, creatures, map objects, artifacts, spells, skills, buffs,
and factions — all with English display names.

Thumbnail support is **not** part of this issue but is explicitly prepared for. Every
catalog entry that has a corresponding game icon stores its `icon` SID. A shared
`thumbnailPath(iconId)` utility resolves to a PNG path in Tauri app data if the file
exists (populated later by issue #62), or `null` otherwise. All dropdown/display
components use `<img>` with a graceful text fallback so thumbnails appear automatically
once extracted — with no UI changes needed.

---

## Core.zip source resolution (priority order)

> **Copyright notice:** `Core.zip` is a copyrighted game asset extracted directly from
> the player's own game installation. It must **never** be committed to the repository
> or distributed with the editor. It is listed in `.gitignore` (`*.zip`) and must stay
> that way. The editor always reads the file from the user's local machine only.

1. **Windows (Tauri desktop only):** probe default Steam install paths:
   - `C:\Program Files (x86)\Steam\steamapps\common\Heroes of Might & Magic Olden Era`
   - `C:\Program Files (x86)\Steam\steamapps\common\Heroes of Might and Magic Olden Era`
   - `C:\Program Files\Steam\steamapps\common\Heroes of Might & Magic Olden Era`
   - Valid install = contains `HeroesOldenEra_Data/app.info`
   - Core.zip = `HeroesOldenEra_Data/StreamingAssets/Core.zip`

2. **Fallback (Tauri, all platforms):** if no Steam install is detected (non-Windows OS
   or game not installed via Steam), look for `Core.zip` next to the running binary via
   Tauri's `path.resourceDir()`. The developer places their own copy there locally for
   development — it is never committed.

3. **Web build:** no automatic discovery is possible. The user must provide `Core.zip`
   manually via a file picker (`<input type="file" accept=".zip">`). The file is read
   entirely in memory with `jszip` and never written to disk or sent anywhere.

4. **Manual override (Tauri):** user can point the editor at any `Core.zip` on disk via
   a file picker. The chosen path is saved in Tauri settings and used on subsequent
   launches.

---

## Data extracted from Core.zip

All paths are relative to the zip root. All JSON files use the `{array: [...]}` wrapper
with an `id` field per entry. English names are resolved from `Lang/english/texts/`.

| Entity | Zip path(s) | Name localization |
|---|---|---|
| Heroes | `DB/heroes/**/*.json` | `Lang/english/texts/heroInfo.json` — lookup by `hero.name` SID, fallback to `hero.id` |
| Creatures / Units | `DB/units/units_logics/*.json` | `Lang/english/texts/unitsAbility.json` — pattern `{unit.id}_name` |
| Artifacts | `DB/items/items/*.json` | `Lang/english/texts/artifacts.json` — lookup via artifact `name` field SID |
| Spells | `DB/magics/*.json` | `Lang/english/texts/magic.json` — lookup via spell `name` field SID |
| Skills | `DB/heroes_skills/skills/*.json` | `Lang/english/texts/heroSkills.json` — lookup via skill `name` field SID |
| Buffs | `DB/buffs/*.json` | `Lang/english/texts/magic_buff.json` — lookup via `name_` field SID |
| Map Objects (interactables) | `DB/map/objects/4_interactables.json` | `Lang/english/texts/mapObjects.json` — pattern `{id}_name` |
| Map Objects (resources) | `DB/map/objects/3_resources.json` | same |
| Map Objects (environments) | `DB/map/objects/1_environments.json` | same |
| Map Objects (spawns) | `DB/map/objects/7_spawns.json` | same |
| Factions | `DB/fractions/*.json` | faction `name` field is already a localized string |

### Dialog corpus

~769 dialog flows from `DB/dialogs/dialogs/*.json`, with slide text resolved to English
via `Lang/english/texts/dialogues.json` and `Lang/english/texts/customMaps.json`.
Searchable by dialog id, speaker name, and slide text. English only — no multi-language
support.

---

## Data model (`src/lib/catalog/types.ts`)

```ts
export interface CatalogHero {
  id: string
  name: string          // resolved English name
  fraction: string      // e.g. "human", "undead"
  icon: string          // icon SID — used by thumbnailPath() in issue #62
  classType?: string
}

export interface CatalogCreature {
  id: string
  name: string          // resolved via {id}_name in unitsAbility.json
  fraction: string
  tier: number
  icon?: string         // icon SID for future thumbnail support
}

export interface CatalogArtifact {
  id: string
  name: string
  icon: string          // icon SID for future thumbnail support
  slot?: string
  rarity?: string
}

export interface CatalogSpell {
  id: string
  name: string
  icon: string          // icon SID for future thumbnail support
  school?: string
  rank?: number
}

export interface CatalogSkill {
  id: string
  name: string
  icon?: string         // icon SID for future thumbnail support
}

export interface CatalogBuff {
  id: string
  name: string
  icon?: string         // icon SID for future thumbnail support
}

export interface CatalogMapObject {
  id: string
  name: string
  tag?: string
  category: 'interactables' | 'resources' | 'environments' | 'spawns'
  isInteractable: boolean   // false = cannot have quests/events attached
  icon?: string             // icon SID for future thumbnail support
}

export interface CatalogFaction {
  id: string
  name: string
  icon?: string             // icon SID for future thumbnail support
}

export interface CatalogDialogSlide {
  id: string
  text?: string             // resolved English text (may be empty for action-only slides)
  speakerName?: string      // resolved from title.sid via dialogues.json
}

export interface CatalogDialog {
  id: string
  slideCount: number
  firstText?: string        // first slide text preview for search results
  slides: CatalogDialogSlide[]
}

export interface GameCatalog {
  version: number           // schema version, bump on breaking changes
  generatedAt: string
  sourceHint: string        // e.g. "Steam install" / "project root Core.zip"
  heroes: CatalogHero[]
  creatures: CatalogCreature[]
  artifacts: CatalogArtifact[]
  spells: CatalogSpell[]
  skills: CatalogSkill[]
  buffs: CatalogBuff[]
  mapObjects: CatalogMapObject[]
  factions: CatalogFaction[]
  dialogs: CatalogDialog[]
}
```

### Thumbnail utility (`src/lib/catalog/thumbnails.ts`)

```ts
/**
 * Resolves an icon SID to a local PNG path if it has been extracted (issue #62).
 * Returns null when thumbnails have not been extracted yet — callers fall back to text.
 * Tauri-only: always returns null in the web build.
 */
export function thumbnailPath(iconId: string): string | null

/**
 * React component: renders a thumbnail <img> if available, otherwise a text badge.
 * All catalog dropdowns use this so thumbnails appear automatically after extraction.
 */
export function CatalogIcon({ iconId, name, size }: CatalogIconProps): JSX.Element
```

`CatalogIcon` is used in every entity dropdown and detail view. When thumbnails are
extracted by issue #62, they simply appear — no UI changes needed.

---

## Implementation plan

### Step 1 — Core.zip loader (`src/lib/catalog/zip-loader.ts`)

- `findCoreZip(): Promise<ArrayBuffer | null>`
  - **Tauri:** try Steam paths via `@tauri-apps/plugin-fs` `exists()` + `readFile()`, then
    fall back to `path.resourceDir() + '/Core.zip'` (developer places their own copy
    there locally — never committed to git)
  - **Web:** returns `null` — no automatic discovery; user must provide file manually
- `readZipEntry(zip: JSZip, path: string): Promise<string>` — read a zip entry as UTF-8,
  stripping BOM (`\uFEFF`) if present
- Cache the open `JSZip` instance for the duration of catalog building

> `Core.zip` is never written to disk by the editor, never cached in a way that could
> be committed, and never sent over the network. In the web build it lives only in
> memory for the duration of catalog building.

### Step 2 — Catalog builder (`src/lib/catalog/builder.ts`)

One `async` function `buildCatalog(zip: JSZip): Promise<GameCatalog>`:

```
buildCatalog(zip)
  ├── loadLocalization(zip)         → Map<string, string>  (English tokens only)
  ├── collectHeroes(zip, loc)       → CatalogHero[]
  ├── collectCreatures(zip, loc)    → CatalogCreature[]
  ├── collectArtifacts(zip, loc)    → CatalogArtifact[]
  ├── collectSpells(zip, loc)       → CatalogSpell[]
  ├── collectSkills(zip, loc)       → CatalogSkill[]
  ├── collectBuffs(zip, loc)        → CatalogBuff[]
  ├── collectMapObjects(zip, loc)   → CatalogMapObject[]
  ├── collectFactions(zip, loc)     → CatalogFaction[]
  └── collectDialogs(zip, loc)      → CatalogDialog[]
```

`loadLocalization` merges `Lang/english/texts/*.json` into a single `Map<sid, text>`
used by all collectors, including dialog text resolution. No other languages are loaded.

`collectMapObjects` reads all four object files and assigns `category` and `isInteractable`:
- `4_interactables.json` → `category: 'interactables'`, `isInteractable` from entry field
- `3_resources.json` → `category: 'resources'`, `isInteractable: false`
- `1_environments.json` → `category: 'environments'`, `isInteractable: false`
- `7_spawns.json` → `category: 'spawns'`, `isInteractable: false`

Helper: `readJsonArray(zip, path): Promise<any[]>` — reads a zip entry and returns
`data.array` (the standard game JSON format).

### Step 3 — Thumbnail utility (`src/lib/catalog/thumbnails.ts`)

Implement `thumbnailPath()` and `CatalogIcon` as stubs:
- `thumbnailPath()` checks for PNG existence in Tauri app data dir
  (`AppLocalData/thumbnails/{iconId}.png`). Returns the `asset://` URL if found, `null`
  otherwise.
- `CatalogIcon` renders `<img>` when path is non-null, text badge when null.
- Both are no-ops (return `null` / text-only) in the web build.
- This is the entire interface that issue #62 (thumbnail extraction) will populate —
  no further UI changes needed at that point.

### Step 4 — Catalog store (`src/store/useCatalogStore.ts`)

Zustand store (not persisted — rebuilt on demand, takes ~1–2 seconds max):

```ts
interface CatalogStore {
  catalog: GameCatalog | null
  loading: boolean
  error: string | null
  load(): Promise<void>                    // build from auto-discovered Core.zip
  loadFromFile(file: File): Promise<void>  // build from user-provided file
  clear(): void
}
```

- `load()` calls `findCoreZip()` → `buildCatalog()` → sets `catalog`
- Runs automatically on first app load (non-blocking, fires in background)
- On failure: sets `error`, stores remain usable with hardcoded fallback

### Step 5 — Entity helpers (`src/schema/entities.ts`)

Augment existing helpers to prefer catalog data when available:

```ts
// Before: returns hardcoded string array
export function getHeroes(): string[]

// After: returns enriched entries if catalog loaded, hardcoded SIDs as fallback
export function getHeroes(): Array<{id: string; name: string; fraction: string; icon?: string}>
export function getHeroIds(): string[]   // backwards-compat shim
```

Same pattern for `getCreatures()`, `getArtifacts()`, `getMapObjects()`, `getSpells()`,
`getSkills()`, `getBuffs()`.

New additions (not in current hardcoded lists):
- `getSpells()` — from `DB/magics/`
- `getSkills()` — from `DB/heroes_skills/`
- `getBuffs()` — from `DB/buffs/`

### Step 6 — Map object filter dialog

Map object dropdowns (used in `ObjectLose`, `ObjectOwn`, and any quest/event object
assignment) show all objects by default. A funnel icon next to the dropdown opens a
small filter dialog:

```
┌─────────────────────────────────┐
│  Filter Map Objects          ✕  │
│                                 │
│  ☑ Interactable only            │
│                                 │
│  Category                       │
│  ☑ Interactables  ☑ Spawns      │
│  ☑ Resources      ☑ Environments│
│                                 │
│  Tag                            │
│  ☑ mine  ☑ dwelling  ☑ shrine   │
│  ☑ ... (all tags)               │
│                                 │
│  [Reset]          [Apply]       │
└─────────────────────────────────┘
```

- Filter state persisted to localStorage per dropdown context (so "interactable only"
  stays on after the user sets it once)
- Filtered count shown on the funnel icon badge: e.g. `⚙ 47/315`

### Step 7 — Dropdowns and autocomplete

Where action/condition parameters currently use free-text inputs or bare SID lists,
upgrade to searchable dropdowns backed by catalog data. All entries rendered via
`CatalogIcon` (thumbnail-ready from day one):

| Action / Condition | Parameter | Current | After |
|---|---|---|---|
| `AddItemHero`, `RemoveItemHero` | artifact SID | free text | searchable dropdown |
| `AddSpellHero` | spell SID | free text | searchable dropdown |
| `AddSkillHero` | skill SID | free text | searchable dropdown |
| `AddBuffHeroDays` | buff SID | free text | searchable dropdown |
| `HeroKill`, `HeroInteract` conditions | hero SID | bare list | name + fraction dropdown |
| `SquadKill`, `UnitOwnSide` | creature SID | bare list | name + tier + faction dropdown |
| `ObjectLose`, `ObjectOwn` | map object SID | bare list | name + tag dropdown + filter |
| `Dialog`, `RandomDialog` | dialog key | free text | searchable + "create new" |

Display format: `"Hero Name (hero_sid)"` — human name visible, SID stored in JSON.

### Step 8 — Dialog corpus browser (`src/components/catalog/DialogBrowser.tsx`)

A searchable panel (accessible from toolbar "Browse Game Dialogs") for browsing all
~769 game dialogs. Useful for reusing existing speaker setups, dialog patterns, or
finding slide text to copy:

- Search box (searches dialog id, speaker name, slide text — English)
- Results list: dialog id, first slide text preview, slide count
- Click → expand to show all slides with resolved text and speaker names
- "Copy ID" button to grab the dialog id for use in a `Dialog` action

### Step 9 — UI integration

**Toolbar button:** "Game Data" (spinner when loading, checkmark when ready, warning
icon on error). Opens a small status popover: entity counts, source path, "Rebuild"
and "Load from file…" buttons.

**First-load behavior:**
- On startup, `useCatalogStore.load()` fires in background
- Core.zip found → silently builds catalog, no user interaction needed
- Core.zip not found → soft warning in status bar:
  "Game data not loaded — dropdowns show SIDs only. [Load Core.zip]"

---

## Relationship to issue #62 (thumbnails)

This issue deliberately prepares the thumbnail integration point:

| Prepared here | Completed in #62 |
|---|---|
| `icon` field on every catalog type | Python extractor that populates PNGs |
| `thumbnailPath(iconId)` utility | Tauri command to run the extractor |
| `CatalogIcon` component with fallback | First-run flow to trigger extraction |
| `asset://` URL resolution stub | Actual PNG files in app data |

When #62 is complete, thumbnails appear everywhere with **zero further UI changes**.

---

## Files to create / modify

| File | Action |
|---|---|
| `src/lib/catalog/types.ts` | NEW — TypeScript interfaces for catalog |
| `src/lib/catalog/zip-loader.ts` | NEW — Core.zip discovery and loading |
| `src/lib/catalog/builder.ts` | NEW — catalog extraction from JSZip instance |
| `src/lib/catalog/thumbnails.ts` | NEW — `thumbnailPath()` + `CatalogIcon` stub |
| `src/store/useCatalogStore.ts` | NEW — Zustand store |
| `src/schema/entities.ts` | MODIFY — augment helpers to use catalog |
| `src/components/catalog/DialogBrowser.tsx` | NEW — searchable dialog corpus UI |
| `src/components/catalog/MapObjectFilter.tsx` | NEW — filter dialog for map object dropdowns |
| `src/components/layout/Toolbar.tsx` | MODIFY — add "Game Data" button/status |
| Action/condition form components | MODIFY — upgrade params to catalog-backed dropdowns |

---

## Implementation order

1. `src/lib/catalog/types.ts`
2. `src/lib/catalog/zip-loader.ts`
3. `src/lib/catalog/builder.ts`
4. `src/lib/catalog/thumbnails.ts` — stubs only, ready for #62
5. `src/store/useCatalogStore.ts`
6. `src/schema/entities.ts` — augment helpers, keep fallbacks
7. `src/components/catalog/MapObjectFilter.tsx`
8. Upgrade action/condition dropdowns (all via `CatalogIcon`)
9. `src/components/catalog/DialogBrowser.tsx`
10. Toolbar integration + first-load background fetch
