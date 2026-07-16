import { Fragment } from 'react'
import type { GuideSection } from '@/hooks/useGuideData'
import { Info, AlertTriangle } from 'lucide-react'
import { useGuideStore } from '@/store/useGuideStore'

interface Props {
  title: string
  sections: GuideSection[]
}

// ── Inline markup renderer ───────────────────────────────────────────────────
// Handles: **bold**, `code`, [text](guide:article-id), \n newlines

function renderBody(text: string, navigateTo: (id: string) => void): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Split on markdown patterns: **bold**, `code`, [link](guide:id), \n
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(guide:[^)]+\)|\n)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>)
    }

    const token = match[0]

    if (token === '\n') {
      parts.push(<br key={key++} />)
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold text-foreground">{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++} className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{token.slice(1, -1)}</code>)
    } else if (token.startsWith('[')) {
      const linkText = token.match(/\[([^\]]+)\]/)?.[1] ?? ''
      const articleId = token.match(/\(guide:([^)]+)\)/)?.[1] ?? ''
      parts.push(
        <button
          key={key++}
          type="button"
          onClick={() => navigateTo(articleId)}
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {linkText}
        </button>
      )
    }

    last = match.index + token.length
  }

  if (last < text.length) {
    parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>)
  }

  return parts
}

// ── Article renderer ─────────────────────────────────────────────────────────

export default function GuideArticle({ title, sections }: Props) {
  const { navigateTo } = useGuideStore()

  return (
    <article className="space-y-5 text-sm leading-relaxed">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      {sections.map((section, i) => (
        <section key={i} className="space-y-2">
          {section.heading && (
            <h3 className="text-sm font-medium text-foreground">{section.heading}</h3>
          )}

          <p className="text-muted-foreground">
            {renderBody(section.body, navigateTo)}
          </p>

          {section.note && (
            <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700/30 p-3">
              <Info className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-blue-700 dark:text-blue-200 text-xs">{renderBody(section.note, navigateTo)}</p>
            </div>
          )}

          {section.warning && (
            <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/30 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-amber-800 dark:text-amber-200 text-xs">{renderBody(section.warning, navigateTo)}</p>
            </div>
          )}
        </section>
      ))}
    </article>
  )
}
