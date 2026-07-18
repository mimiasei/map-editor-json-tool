import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { GuideSection } from '@/hooks/useGuideData'
import { Info, AlertTriangle } from 'lucide-react'
import { useGuideStore } from '@/store/useGuideStore'

interface Props {
  title: string
  sections: GuideSection[]
}

// ── Markdown component map ───────────────────────────────────────────────────

function useMarkdownComponents(navigateTo: (id: string) => void): Components {
  return {
    // Headings (h3/h4 inside section bodies)
    h3: ({ children }) => (
      <h4 className="text-xs font-semibold text-foreground mt-3 mb-1">{children}</h4>
    ),
    h4: ({ children }) => (
      <h5 className="text-xs font-medium text-foreground mt-2 mb-1">{children}</h5>
    ),

    // Paragraphs
    p: ({ children }) => (
      <p className="text-muted-foreground leading-relaxed mb-2 last:mb-0">{children}</p>
    ),

    // Inline code
    code: ({ children, className }) => {
      const isBlock = className?.startsWith('language-')
      if (isBlock) {
        return (
          <code className="block bg-muted rounded p-2 text-xs font-mono whitespace-pre overflow-x-auto">
            {children}
          </code>
        )
      }
      return (
        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono text-foreground">
          {children}
        </code>
      )
    },

    // Code blocks
    pre: ({ children }) => (
      <pre className="bg-muted rounded p-2 text-xs font-mono overflow-x-auto mb-2">{children}</pre>
    ),

    // Bold
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),

    // Unordered list
    ul: ({ children }) => (
      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground mb-2 pl-1">{children}</ul>
    ),

    // Ordered list
    ol: ({ children }) => (
      <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground mb-2 pl-1">{children}</ol>
    ),

    // List item
    li: ({ children }) => (
      <li className="leading-relaxed">{children}</li>
    ),

    // Table wrapper — horizontal scroll for narrow dialogs
    table: ({ children }) => (
      <div className="overflow-x-auto mb-2">
        <table className="w-full text-xs border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="border-b border-border">{children}</thead>
    ),
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => (
      <tr className="border-b border-border/50 last:border-0">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="text-left px-2 py-1.5 font-semibold text-foreground whitespace-nowrap">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-2 py-1.5 text-muted-foreground align-top">{children}</td>
    ),

    // Links — handle guide: protocol internally, open others externally
    a: ({ href, children }) => {
      if (href?.startsWith('guide:')) {
        const articleId = href.slice('guide:'.length)
        return (
          <button
            type="button"
            onClick={() => navigateTo(articleId)}
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {children}
          </button>
        )
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {children}
        </a>
      )
    },

    // Horizontal rule
    hr: () => <hr className="border-border my-3" />,
  }
}

// ── Article renderer ─────────────────────────────────────────────────────────

export default function GuideArticle({ title, sections }: Props) {
  const { navigateTo } = useGuideStore()
  const components = useMarkdownComponents(navigateTo)

  return (
    <article className="space-y-4 text-sm">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>

      {sections.map((section, i) => (
        <section key={i} className="space-y-2">
          {section.heading && (
            <h3 className="text-sm font-medium text-foreground">{section.heading}</h3>
          )}

          {section.body && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {section.body}
            </ReactMarkdown>
          )}

          {section.note && (
            <div className="flex gap-2 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-700/30 p-3">
              <Info className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-blue-700 dark:text-blue-200 text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {section.note}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {section.warning && (
            <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/30 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-amber-800 dark:text-amber-200 text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                  {section.warning}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </section>
      ))}
    </article>
  )
}
