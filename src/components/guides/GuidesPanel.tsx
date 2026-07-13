import { useState, useEffect } from 'react'
import { useGuideStore } from '@/store/useGuideStore'
import { useGuideIndex, loadGuideArticle } from '@/hooks/useGuideData'
import type { GuideArticle as GuideArticleType } from '@/hooks/useGuideData'
import GuideArticle from './GuideArticle'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The inner content of the Guides panel.
 * Used both inside GuidesDialog (docked) and PanelShell (undocked Tauri window).
 * Reads all state from useGuideStore — no props needed.
 */
export function GuidesContent() {
  const { activeArticleId, navigateTo } = useGuideStore()
  const guideIndex = useGuideIndex()

  const [search, setSearch] = useState('')
  const [article, setArticle] = useState<GuideArticleType | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!activeArticleId) { setArticle(null); setLoadError(null); return }
    let cancelled = false
    setLoadError(null)
    loadGuideArticle(activeArticleId)
      .then((a) => { if (!cancelled) setArticle(a) })
      .catch((e) => { if (!cancelled) setLoadError(String(e)) })
    return () => { cancelled = true }
  }, [activeArticleId])

  const query = search.trim().toLowerCase()
  const filteredIds = new Set(
    query
      ? guideIndex.articles.filter((a) => a.id.includes(query) || a.category.includes(query)).map((a) => a.id)
      : guideIndex.articles.map((a) => a.id)
  )

  const articlesByCategory = (categoryId: string) =>
    guideIndex.articles.filter((a) => a.category === categoryId).sort((a, b) => a.order - b.order)

  const articleTitle = (id: string) =>
    id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Search */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-7 text-xs"
            placeholder="Search guides…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (e.target.value) useGuideStore.setState({ activeArticleId: null })
            }}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <ScrollArea className="w-44 shrink-0 border-r border-border">
          <nav className="p-2 space-y-3">
            {guideIndex.categories.map((cat) => {
              const visible = articlesByCategory(cat.id).filter((a) => filteredIds.has(a.id))
              if (visible.length === 0) return null
              return (
                <div key={cat.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1">
                    {cat.label}
                  </p>
                  {visible.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { navigateTo(a.id); setSearch('') }}
                      className={cn(
                        'w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between gap-1',
                        activeArticleId === a.id
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      <span className="truncate">{articleTitle(a.id)}</span>
                      {activeArticleId === a.id && <ChevronRight className="h-3 w-3 shrink-0" />}
                    </button>
                  ))}
                </div>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Article body */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {!activeArticleId && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Select a guide from the sidebar.</p>
                <div className="space-y-1">
                  {guideIndex.articles.slice(0, 3).map((a) => (
                    <button key={a.id} type="button" onClick={() => navigateTo(a.id)}
                      className="block w-full text-left text-xs text-primary hover:underline py-0.5">
                      {articleTitle(a.id)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeArticleId && loadError && <p className="text-xs text-destructive">Failed to load: {loadError}</p>}
            {activeArticleId && !loadError && !article && <p className="text-xs text-muted-foreground">Loading…</p>}
            {article && <GuideArticle title={article.title} sections={article.sections} />}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

export default GuidesContent
