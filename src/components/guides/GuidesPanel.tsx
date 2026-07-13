import { useState, useEffect } from 'react'
import { useGuideStore } from '@/store/useGuideStore'
import { useGuideIndex, loadGuideArticle } from '@/hooks/useGuideData'
import type { GuideArticle as GuideArticleType } from '@/hooks/useGuideData'
import GuideArticle from './GuideArticle'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, Search, BookOpen, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function GuidesPanel() {
  const { panelOpen, activeArticleId, closePanel, navigateTo } = useGuideStore()
  const guideIndex = useGuideIndex()

  const [search, setSearch] = useState('')
  const [article, setArticle] = useState<GuideArticleType | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load article when activeArticleId changes
  useEffect(() => {
    if (!activeArticleId) {
      setArticle(null)
      setLoadError(null)
      return
    }

    let cancelled = false
    setLoadError(null)

    loadGuideArticle(activeArticleId)
      .then((a) => { if (!cancelled) setArticle(a) })
      .catch((e) => { if (!cancelled) setLoadError(String(e)) })

    return () => { cancelled = true }
  }, [activeArticleId])

  if (!panelOpen) return null

  // Filter articles by search
  const query = search.trim().toLowerCase()
  const filteredArticleIds = new Set(
    query
      ? guideIndex.articles
          .filter((a) => a.id.includes(query))
          .map((a) => a.id)
      : guideIndex.articles.map((a) => a.id)
  )

  const articlesByCategory = (categoryId: string) =>
    guideIndex.articles
      .filter((a) => a.category === categoryId)
      .sort((a, b) => a.order - b.order)

  return (
    <div className="flex flex-col h-full border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="h-4 w-4" />
          Guides
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closePanel}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

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
              // If searching, clear active article to show index
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
              const articles = articlesByCategory(cat.id)
              const visibleArticles = articles.filter((a) => filteredArticleIds.has(a.id))
              if (visibleArticles.length === 0) return null

              return (
                <div key={cat.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 mb-1">
                    {cat.label}
                  </p>
                  {visibleArticles.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        navigateTo(a.id)
                        setSearch('')
                      }}
                      className={cn(
                        'w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between gap-1',
                        activeArticleId === a.id
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                      )}
                    >
                      <span className="truncate">{a.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                      {activeArticleId === a.id && <ChevronRight className="h-3 w-3 shrink-0" />}
                    </button>
                  ))}
                </div>
              )
            })}
          </nav>
        </ScrollArea>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {!activeArticleId && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Select a guide from the sidebar to get started.
                </p>
                <div className="space-y-1">
                  {guideIndex.articles.slice(0, 3).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigateTo(a.id)}
                      className="block w-full text-left text-xs text-primary hover:underline py-0.5"
                    >
                      {a.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeArticleId && loadError && (
              <p className="text-xs text-destructive">Failed to load article: {loadError}</p>
            )}

            {activeArticleId && !loadError && !article && (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}

            {article && (
              <GuideArticle title={article.title} sections={article.sections} />
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
