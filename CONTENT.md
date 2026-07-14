# Authoring Content

How to add and edit the text content in this project: guide articles, tooltips, and templates.

---

## Guide Articles

Guide articles live in `src/data/guides/` as Markdown files. Each file is one article.

**To add a new article:** drop a `.md` file in `src/data/guides/`. No registry update needed — the loader picks it up automatically via Vite glob.

### File format

```markdown
---
title: Your Article Title
category: getting-started
order: 3
---

## Section heading

Body text. Supports full Markdown: **bold**, `inline code`, lists, links.

> **Note:** Use this for informational asides the reader should not miss.

> **Warning:** Use this for gotchas or things that will cause bugs if ignored.

## Next section

Another section's body.
```

### Frontmatter fields

| Field      | Required | Description |
|------------|----------|-------------|
| `title`    | yes      | Displayed in the article header and table of contents. |
| `category` | yes      | Groups articles in the sidebar. Must be one of the IDs below. |
| `order`    | yes      | Sort order within the category. Lower = higher up. Use integers; gaps are fine (1, 2, 10). |

### Categories

| ID                | Label                  |
|-------------------|------------------------|
| `getting-started` | Getting Started        |
| `concepts`        | Core Concepts          |
| `recipes`         | Recipes & Patterns     |
| `troubleshooting` | Gotchas & Workarounds  |

To add a new category, add an entry to the `CATEGORY_LABELS` map at the top of `src/lib/guideLoader.ts`.

### Sections

Each `## Heading` in the body becomes one section. Sections are rendered with the heading, body text, and optional note/warning callout.

- **Note callouts** — `> **Note:** your text` — rendered as a blue/neutral callout box.
- **Warning callouts** — `> **Warning:** your text` — rendered as a yellow/orange callout box.
- One note and one warning per section. Put them at the end of the section body.
- The body before the callout lines is plain Markdown. Paragraph breaks, lists, and inline code all render correctly.

### Internal links

Link to another guide article with `[link text](guide:article-id)`, e.g.:

```markdown
See [Counters and Tracking](guide:counters-and-tracking) for details.
```

---

## Tooltips

Tooltips live in `src/data/tooltips.json`. They appear in the editor UI as hover hints on action and condition names and their parameter fields.

The file has three top-level keys: `actions`, `conditions`, and `fields`.

### Action and condition tooltips

```json
"ActionName": {
  "summary": "One sentence: what this action does.",
  "params": {
    "0": "First parameter description.",
    "1": "Second parameter description."
  },
  "tip": "Optional. A practical usage note or common gotcha."
}
```

| Field     | Required | Description |
|-----------|----------|-------------|
| `summary` | yes      | Shown on the action/condition header. Keep to one sentence. |
| `params`  | no       | Map of `"0"`, `"1"`, etc. to descriptions for each parameter. Omit if the action has no parameters. |
| `tip`     | no       | Extra guidance shown below the parameters. Use for non-obvious behavior, common mistakes, or cross-references to other actions. |

### Field tooltips

```json
"fields": {
  "fieldName": "Short description of this field."
}
```

Field tooltips are plain strings — no `summary`/`tip` structure. They appear as inline hints on named fields (e.g. `isRepeating`, `conditionsLogic`).

### Writing style

- **`summary`** — imperative sentence, no trailing period required. E.g. `"Sets a counter to a specific value."` not `"This action sets..."`.
- **`params`** — describe what the value should be, not just its name. E.g. `"Counter SID — must be declared in the Counters tab."` not just `"Counter SID."`.
- **`tip`** — practical, concrete advice. Mention common mistakes, related actions, or when NOT to use something.

---

## Templates

Templates are JSON files in `src/data/templates/`. They are pre-built scenario snippets that users can load via **File → New from Template**.

### Adding a template

1. Build a representative scenario JSON in the editor.
2. Save it and place the file in `src/data/templates/<template-id>.json`.
3. Register it in `src/data/templates/index.json`:

```json
{
  "id": "my-template",
  "name": "Human-readable name",
  "description": "One or two sentences shown in the template picker.",
  "category": "basic"
}
```

4. Add a lazy importer in `src/hooks/useGuideData.ts` in the `templateImporters` map:

```ts
'my-template': () => import('@/data/templates/my-template.json'),
```

### Template categories

| ID        | Label    |
|-----------|----------|
| `basic`   | Basic    |
| `advanced`| Advanced |

To add a category, edit both `categories` in `src/data/templates/index.json`.

### Template content guidelines

- Use placeholder SIDs that are clearly fake but readable: `kill_quest`, `E_Squad_Dragon`, `kill_quest_name`.
- Include at least one counter, one quest, one subquest, and one trigger so the template demonstrates the full structure.
- Every localization SID referenced in the template should have a corresponding entry in the template's localization block (if the template includes one).

---

## General writing guidelines

- **Audience:** map makers who know HoMM:OE but may be new to quest scripting. Assume they know what a hero is, but not what a trigger is.
- **Tone:** direct and practical. No filler phrases ("It's important to note that…"). State the fact, then the implication.
- **Code references:** use `backtick` for all SIDs, field names, action names, and JSON keys.
- **Cross-references:** link to related guide articles with the `guide:` link syntax. Don't link to external URLs unless necessary.
- **Notes vs Warnings:**
  - **Note** — something useful to know that prevents confusion.
  - **Warning** — something that will silently break the map if ignored.
  - Don't use a Warning for things that are merely unusual.
