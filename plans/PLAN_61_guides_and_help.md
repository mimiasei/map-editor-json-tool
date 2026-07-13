# Issue #61 — In-Editor Guides & Help System

## Background

Creating quests and events for HoMM:OE maps via JSON is non-trivial. The map editor
does not reflect JSON changes visually, the action/condition parameter system is
undocumented in-game, and the correct workflow for testing map scripts requires specific
knowledge that is hard to discover independently.

This feature implements an in-editor help and guidance system based on the author's
own research findings, covering three complementary layers:

1. **Contextual tooltips** — inline `ⓘ` hints on every action, condition, and key
   field explaining what it does and what each parameter expects
2. **Knowledge base panel** — a searchable, categorised guide dock with rich articles
   covering concepts, step-by-step workflows, and known gotchas
3. **Example templates** — annotated ready-to-load scenario templates for common quest
   patterns, selectable from "New from Template"

All user-facing text lives in JSON data files under `src/data/`. Nothing is hardcoded
in component source files.

---

## Data file structure

```
src/data/
├── tooltips.json              ← help text for every action/condition type + key fields
├── guides/
│   ├── index.json             ← table of contents: categories + article order
│   ├── how-quests-work.json
│   ├── first-quest.json
│   ├── triggers-and-conditions.json
│   ├── counters-and-tracking.json
│   ├── dialog-integration.json
│   ├── testing-your-map.json
│   └── gotchas-and-workarounds.json
└── templates/
    ├── index.json             ← template metadata: name, description, category
    ├── simple-kill-quest.json
    ├── counter-based-quest.json
    ├── timed-event.json
    └── dialog-driven-quest.json
```

---

## Data formats

### `tooltips.json`

```json
{
  "actions": {
    "AddItemHero": {
      "summary": "Gives an artifact to the specified hero.",
      "params": {
        "0": "Hero SID — which hero receives the item.",
        "1": "Artifact SID — which artifact to give."
      },
      "tip": "The hero must exist on the map. If the hero's inventory is full, the item is lost."
    },
    "Dialog": {
      "summary": "Triggers a dialog flow by key.",
      "params": {
        "0": "Dialog key — must match a dialog ID in your map ZIP's DB/dialogs/ folder."
      },
      "tip": "The dialog JSON and localization tokens must be included in your map's companion ZIP."
    }
  },
  "conditions": {
    "Counter": {
      "summary": "Checks a counter's value against a threshold.",
      "params": {
        "0": "Counter SID.",
        "1": "Comparison operator: ==, >=, <=, >, <",
        "2": "Value to compare against."
      }
    }
  },
  "fields": {
    "quest.name": "Localization SID shown as the quest name in the in-game quest log. Must have a matching token in customMaps.json.",
    "trigger.isRepeating": "If true, this trigger fires every time its conditions are met, not just the first time.",
    "counter.value": "Initial value of the counter when the map loads. Usually 0."
  }
}
```

### `guides/index.json`

```json
{
  "categories": [
    { "id": "getting-started", "label": "Getting Started" },
    { "id": "concepts",        "label": "Core Concepts"   },
    { "id": "recipes",         "label": "Recipes & Patterns" },
    { "id": "troubleshooting", "label": "Gotchas & Workarounds" }
  ],
  "articles": [
    { "id": "how-quests-work",          "category": "getting-started", "order": 1 },
    { "id": "first-quest",              "category": "getting-started", "order": 2 },
    { "id": "triggers-and-conditions",  "category": "concepts",        "order": 1 },
    { "id": "counters-and-tracking",    "category": "concepts",        "order": 2 },
    { "id": "dialog-integration",       "category": "recipes",         "order": 1 },
    { "id": "timed-event",              "category": "recipes",         "order": 2 },
    { "id": "testing-your-map",         "category": "troubleshooting", "order": 1 },
    { "id": "gotchas-and-workarounds",  "category": "troubleshooting", "order": 2 }
  ]
}
```

### Guide article (`guides/first-quest.json`)

```json
{
  "id": "first-quest",
  "title": "Creating Your First Quest",
  "category": "getting-started",
  "sections": [
    {
      "heading": "Overview",
      "body": "A quest consists of sub-quests, each with one or more triggers. Each trigger has conditions and actions..."
    },
    {
      "heading": "Step 1: Add a counter",
      "body": "Open the Counters tab and add a counter with a descriptive SID, e.g. `quest_dragon_killed`. Set its initial value to `0`.",
      "note": "The map editor will not show this counter — but the game reads it correctly from the JSON."
    },
    {
      "heading": "Step 2: Create the quest",
      "body": "..."
    }
  ]
}
```

**Section fields:**
- `heading` — section title (optional, omit for intro paragraphs)
- `body` — main text; supports inline markup: `**bold**`, `` `code` ``, `[text](guide:article-id)` for cross-links
- `note` — optional callout box (blue info style)
- `warning` — optional callout box (amber warning style)

Body text uses a minimal markdown-like syntax. A lightweight renderer handles bold,
inline code, and inter-guide links. No external markdown library needed.

### `templates/index.json`

```json
{
  "categories": [
    { "id": "basic",    "label": "Basic"    },
    { "id": "advanced", "label": "Advanced" }
  ],
  "templates": [
    {
      "id": "simple-kill-quest",
      "name": "Simple Kill Quest",
      "description": "Completes when the player kills a specific creature stack.",
      "category": "basic"
    },
    {
      "id": "counter-based-quest",
      "name": "Counter-Based Quest",
      "description": "Tracks multi-step progress using counters.",
      "category": "basic"
    }
  ]
}
```

### Template scenario (`templates/simple-kill-quest.json`)

A standard scenario JSON with two extra `_`-prefixed keys (stripped on export):

```json
{
  "_templateMeta": {
    "id": "simple-kill-quest",
    "name": "Simple Kill Quest",
    "description": "Completes when the player kills a specific creature stack."
  },
  "_annotations": {
    "counters[0]": "Tracks whether the target has been killed (0 = alive, 1 = dead).",
    "quests[0]": "The main quest. Its name SID must have a matching token in your map's customMaps.json.",
    "quests[0].subQuests[0].triggers[0]": "Fires when the SquadKill condition is met — i.e. when the target stack is defeated.",
    "quests[0].subQuests[0].triggers[0].actions[0]": "Sets the counter to 1 to mark the quest stage complete.",
    "quests[0].subQuests[0].triggers[0].actions[1]": "Completes the quest and shows the completion message."
  },
  "counters": [ { "sid": "quest_target_killed", "value": 0 } ],
  "quests": [ { "...": "..." } ],
  "interruptions": []
}
```

---

## UI components

### 1. `HelpTooltip` — contextual inline help

**File:** `src/components/ui/HelpTooltip.tsx`

A small `ⓘ` icon placed next to action type labels, condition type labels, and key
form fields. On hover (desktop) or click (touch), shows a popover containing:

- **Summary** — one-line description of what the action/condition does
- **Parameter hints** — one line per parameter, shown when the popover is open
  (or inline as placeholder text in each parameter input if space allows)
- **Tip callout** — optional "watch out" note in amber

Props:
```ts
interface HelpTooltipProps {
  category: 'actions' | 'conditions' | 'fields'
  id: string          // e.g. "AddItemHero", "Counter", "quest.name"
  paramIndex?: number // if set, shows only that param's hint inline
}
```

Reads from `useTooltipData()` hook. Renders nothing if no entry exists for the given
key (graceful degradation — new actions without tooltips yet don't break the UI).

---

### 2. `GuidesPanel` — knowledge base dock

**Files:**
- `src/components/guides/GuidesPanel.tsx` — outer panel with sidebar + content area
- `src/components/guides/GuideArticle.tsx` — renders a single article

**Layout:**

```
┌─────────────────────────────────────────────────┐
│ 🔍 Search guides...                              │
├──────────────┬──────────────────────────────────┤
│ Getting      │  Creating Your First Quest        │
│  Started     │  ───────────────────────────────  │
│  > How quests│  Overview                         │
│  > First     │  A quest consists of sub-quests,  │
│    quest ●   │  each with one or more triggers.  │
│              │                                   │
│ Core Concepts│  ℹ️  The map editor won't show    │
│  > Triggers  │     counter changes — but the     │
│  > Counters  │     game reads them correctly.    │
│              │                                   │
│ Gotchas      │  Step 1: Add a counter            │
│  > Testing   │  Open the Counters tab and...     │
│  > Workaround│                                   │
└──────────────┴──────────────────────────────────┘
```

- Left sidebar: categories and article list from `guides/index.json`; active article
  highlighted
- Search filters both sidebar and body text; matching articles shown, non-matching
  greyed out
- Body: sections rendered by `GuideArticle` — headings, body text with inline
  markup, note/warning callouts
- Cross-links (`[text](guide:article-id)`) navigate to the referenced article within
  the panel
- **Tauri:** panel is undockable (same mechanism as other panels)
- **Accessible from:** toolbar "Guides" button (book icon) — toggles the panel open/closed

---

### 3. `TemplatePickerDialog` — new from template

**File:** `src/components/guides/TemplatePickerDialog.tsx`

A modal dialog opened from **File → New from Template** and from the empty-state screen.

**Layout:**

```
┌──────────────────────────────────────────┐
│  New from Template                    ✕  │
│                                          │
│  Basic           Advanced                │
│  ┌────────────┐  ┌────────────┐          │
│  │ Simple     │  │ Counter-   │          │
│  │ Kill Quest │  │ Based Quest│          │
│  │            │  │            │          │
│  │ Completes  │  │ Tracks     │          │
│  │ when the   │  │ multi-step │          │
│  │ player...  │  │ progress...│          │
│  └────────────┘  └────────────┘          │
│                                          │
│  [Cancel]           [Load Template]      │
└──────────────────────────────────────────┘
```

- Cards grouped by category
- Selected card highlighted; "Load Template" becomes active
- Loading a template calls the existing import path, then populates `_annotations`
  and `_templateMeta` into the store

---

### 4. `AnnotationBanner` — inline template hints

**File:** `src/components/guides/AnnotationBanner.tsx`

When a template is loaded, nodes in the quest/trigger/action tree that have a matching
`_annotations` path show a small info banner directly above them:

```
ℹ️  Tracks whether the target has been killed (0 = alive, 1 = dead).   ✕
```

- Shown on first load; dismissible per-node per-session (not persisted)
- Uses the JSON path of the node (e.g. `quests[0].subQuests[0].triggers[0]`) to match
  against `_annotations`
- Stripped from export along with `_templateMeta` (same as `_dialogs`, `_localization`)
- When all annotations are dismissed, a subtle "Load a template guide →" hint replaces
  the empty state instead

---

## Data loading

**File:** `src/hooks/useGuideData.ts`

Since all data files are static JSON in `src/data/`, Vite imports them at build time.
No async file I/O needed.

```ts
// Loaded once, available everywhere via a lightweight context or zustand slice
const tooltips = await import('../data/tooltips.json')
const guideIndex = await import('../data/guides/index.json')
// Individual articles loaded on demand:
const article = await import(`../data/guides/${id}.json`)
```

Three exported hooks:
- `useTooltips()` → `TooltipData` — used by `HelpTooltip`
- `useGuideIndex()` → `GuideIndex` — used by `GuidesPanel` sidebar
- `useGuideArticle(id)` → `GuideArticle` — used by `GuideArticle` renderer
- `useTemplateIndex()` → `TemplateIndex` — used by `TemplatePickerDialog`

---

## Store additions (`src/store/useGuideStore.ts`)

Small Zustand slice:

```ts
interface GuideStore {
  panelOpen: boolean
  activeArticleId: string | null
  dismissedAnnotations: Set<string>   // persisted to localStorage
  openPanel(articleId?: string): void
  closePanel(): void
  navigateTo(articleId: string): void
  dismissAnnotation(path: string): void
}
```

`dismissedAnnotations` is persisted so banners don't reappear after reload.

---

## Import / export changes

**`src/lib/import.ts`:**
- Extract `_templateMeta` and `_annotations` from loaded JSON
- Store via `useGuideStore` (annotations) and scenario store (templateMeta)
- Both keys stripped before the remaining object goes through the existing parse path

**`src/lib/export.ts`:**
- Strip `_templateMeta` and `_annotations` before export (same pattern as `_dialogs`)

---

## Files to create

| File | Purpose |
|---|---|
| `src/data/tooltips.json` | Help text for all actions, conditions, key fields |
| `src/data/guides/index.json` | Guide table of contents |
| `src/data/guides/*.json` | Individual guide articles (seed: 2–3 articles) |
| `src/data/templates/index.json` | Template metadata |
| `src/data/templates/*.json` | Annotated example scenarios (seed: 1–2 templates) |
| `src/hooks/useGuideData.ts` | Data loading hooks |
| `src/store/useGuideStore.ts` | Panel state + dismissed annotations |
| `src/components/ui/HelpTooltip.tsx` | Contextual tooltip component |
| `src/components/guides/GuidesPanel.tsx` | Knowledge base dock panel |
| `src/components/guides/GuideArticle.tsx` | Article renderer |
| `src/components/guides/TemplatePickerDialog.tsx` | "New from Template" modal |
| `src/components/guides/AnnotationBanner.tsx` | Inline template annotation banners |

## Files to modify

| File | Change |
|---|---|
| `src/components/layout/Toolbar.tsx` | Add "Guides" button (book icon) |
| Action/condition form components | Add `<HelpTooltip>` next to type labels and param inputs |
| File menu component | Add "New from Template" menu item |
| Empty-state component | Add "New from Template" shortcut |
| `src/lib/import.ts` | Handle `_templateMeta` and `_annotations` |
| `src/lib/export.ts` | Strip `_templateMeta` and `_annotations` on export |

---

## Implementation order

1. `src/data/tooltips.json` — seed content for the most-used actions/conditions
2. `src/hooks/useGuideData.ts`
3. `src/components/ui/HelpTooltip.tsx` — wire into action/condition forms
4. `src/data/guides/index.json` + 2–3 seed articles
5. `src/store/useGuideStore.ts`
6. `src/components/guides/GuidesPanel.tsx` + `GuideArticle.tsx`
7. Toolbar "Guides" button
8. `src/data/templates/index.json` + 1–2 seed templates
9. `src/components/guides/TemplatePickerDialog.tsx`
10. `src/components/guides/AnnotationBanner.tsx`
11. Import/export handling for `_templateMeta` / `_annotations`
12. Fill in remaining tooltip and guide content from research findings

---

## Content to write (separate from implementation)

Once the infrastructure is in place, the following content needs to be authored in the
JSON data files based on the author's research:

**Tooltips:** All 40+ action types, all 19 condition types, key field descriptions

**Guide articles:**
- "How Quests Work" — quest/subquest/trigger/condition/action hierarchy
- "Creating Your First Quest" — step-by-step walkthrough
- "Triggers and Conditions" — every condition type explained
- "Counters and Tracking" — using counters for multi-stage quest progress
- "Dialog Integration" — wiring dialogs to quest events
- "Testing Your Map" — the correct workflow (map editor won't reflect JSON, but the game does)
- "Gotchas & Workarounds" — known issues, edge cases, things that look wrong but work

**Templates:**
- Simple Kill Quest
- Counter-Based Multi-Stage Quest
- Timed Event
- Dialog-Driven Quest
