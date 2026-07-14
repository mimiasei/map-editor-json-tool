// ─── Guide Markdown loader ────────────────────────────────────────────────────
// Loads all .md files in src/data/guides/ at build time via Vite glob.
// Each file has YAML frontmatter (title, category, order) followed by
// sections delimited by ## headings. Notes and warnings are expressed as
// blockquotes prefixed with **Note:** or **Warning:** at the end of a section.
//
// This replaces the manual index.json + individual .json article files.
// To add a new guide: drop a .md file in src/data/guides/ — no registry needed.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuideSection {
  heading?: string
  body: string
  note?: string
  warning?: string
}

export interface GuideArticle {
  id: string
  title: string
  category: string
  sections: GuideSection[]
}

export interface GuideArticleMeta {
  id: string
  category: string
  order: number
}

export interface GuideCategory {
  id: string
  label: string
}

export interface GuideIndex {
  categories: GuideCategory[]
  articles: GuideArticleMeta[]
}

// ─── Category labels ──────────────────────────────────────────────────────────
// Adding a new category: add an entry here and use the id in guide frontmatter.

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  'concepts':        'Core Concepts',
  'recipes':         'Recipes & Patterns',
  'troubleshooting': 'Gotchas & Workarounds',
}

// ─── Raw file glob ────────────────────────────────────────────────────────────

const rawFiles = import.meta.glob('../data/guides/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: raw }
  const fmBlock = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).trimStart()
  const meta: Record<string, string> = {}
  for (const line of fmBlock.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  return { meta, body }
}

function parseSections(body: string): GuideSection[] {
  // Split on lines that start a new ## heading
  const parts = body.split(/\n(?=## )/)
  const sections: GuideSection[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    let heading: string | undefined
    let content: string

    if (trimmed.startsWith('## ')) {
      const nl = trimmed.indexOf('\n')
      heading = nl === -1 ? trimmed.slice(3).trim() : trimmed.slice(3, nl).trim()
      content = nl === -1 ? '' : trimmed.slice(nl + 1).trim()
    } else {
      content = trimmed
    }

    // Extract > **Note:** and > **Warning:** lines from the section body
    let note: string | undefined
    let warning: string | undefined
    const bodyLines: string[] = []

    for (const line of content.split('\n')) {
      const noteMatch = line.match(/^>\s*\*\*Note:\*\*\s*(.+)/)
      const warnMatch = line.match(/^>\s*\*\*Warning:\*\*\s*(.+)/)
      if (noteMatch) { note = noteMatch[1]; continue }
      if (warnMatch) { warning = warnMatch[1]; continue }
      // Skip blank blockquote continuation lines adjacent to note/warning
      if (line.match(/^>\s*$/) && (note !== undefined || warning !== undefined)) continue
      bodyLines.push(line)
    }

    sections.push({
      ...(heading !== undefined ? { heading } : {}),
      body: bodyLines.join('\n').trim(),
      ...(note     !== undefined ? { note }    : {}),
      ...(warning  !== undefined ? { warning } : {}),
    })
  }

  return sections
}

function idFromPath(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '')
}

// ─── Parsed article map (eager — all built at module load time) ───────────────

const parsedArticles = new Map<string, GuideArticle>()

for (const [path, raw] of Object.entries(rawFiles)) {
  const id = idFromPath(path)
  const { meta, body } = parseFrontmatter(raw)
  parsedArticles.set(id, {
    id,
    title:    meta['title']    ?? id,
    category: meta['category'] ?? 'uncategorized',
    sections: parseSections(body),
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Build the full guide index from all parsed .md files. */
export function buildGuideIndex(): GuideIndex {
  const articleMetas: GuideArticleMeta[] = []

  for (const [path, raw] of Object.entries(rawFiles)) {
    const id = idFromPath(path)
    const { meta } = parseFrontmatter(raw)
    articleMetas.push({
      id,
      category: meta['category'] ?? 'uncategorized',
      order:    parseInt(meta['order'] ?? '99', 10),
    })
  }

  // Stable order: by category declaration order, then by article order within category
  const categoryOrder = Object.keys(CATEGORY_LABELS)
  articleMetas.sort((a, b) => {
    const catDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
    return catDiff !== 0 ? catDiff : a.order - b.order
  })

  // Only include categories that have at least one article
  const usedCategories = new Set(articleMetas.map((a) => a.category))
  const categories: GuideCategory[] = categoryOrder
    .filter((id) => usedCategories.has(id))
    .map((id) => ({ id, label: CATEGORY_LABELS[id] ?? id }))

  return { categories, articles: articleMetas }
}

/** Load a guide article by ID. Synchronous — all content is eager-loaded. */
export async function loadGuideArticle(id: string): Promise<GuideArticle> {
  const article = parsedArticles.get(id)
  if (!article) return Promise.reject(new Error(`Unknown guide article: ${id}`))
  return article
}
