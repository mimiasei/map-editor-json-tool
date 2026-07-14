// ─── Dialog corpus browser ────────────────────────────────────────────────────
// Searchable panel of all game dialog flows extracted from Core.zip.
// Useful for finding speaker setups, copying dialog IDs into Dialog actions,
// or browsing dialog text.

import { useState, useMemo } from 'react'
import { useCatalogStore } from '@/store/useCatalogStore'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Search, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import type { CatalogDialog } from '@/lib/catalog/types'

// ─── Dialog row ───────────────────────────────────────────────────────────────

interface DialogRowProps {
  item: CatalogDialog
  onCopyId: (id: string) => void
}

function DialogRow({ item, onCopyId }: DialogRowProps) {
  const [expanded, setExpanded] = useState(false)
  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Header row */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono text-xs truncate flex-1">{item.id}</span>
        <Badge variant="secondary" className="text-xs h-4 px-1 shrink-0">
          {item.slideCount} slide{item.slideCount !== 1 ? 's' : ''}
        </Badge>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded"
          title="Copy dialog ID"
          onClick={(e) => { e.stopPropagation(); onCopyId(item.id) }}
        >
          <Copy className="h-3 w-3" />
        </button>
      </button>

      {/* Preview text (first slide) */}
      {!expanded && item.firstText && (
        <p className="px-3 pb-2 text-xs text-muted-foreground line-clamp-1 ml-6">
          {item.firstText}
        </p>
      )}

      {/* Expanded slides */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {item.slides.map((slide, i) => (
            <div key={i} className="px-3 py-2 ml-6 space-y-0.5">
              {slide.speakerName && (
                <p className="text-xs font-semibold text-primary">{slide.speakerName}</p>
              )}
              {slide.text ? (
                <p className="text-xs text-muted-foreground">{slide.text}</p>
              ) : (
                <p className="text-xs text-muted-foreground/50 italic">
                  [no text — action-only slide]
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function DialogBrowser({ open, onOpenChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const results = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    if (!q) return catalog.dialogs
    return catalog.dialogs.filter((d) => {
      if (d.id.toLowerCase().includes(q)) return true
      if (d.slides.some((s) => s.speakerName?.toLowerCase().includes(q))) return true
      if (d.slides.some((s) => s.text?.toLowerCase().includes(q))) return true
      return false
    })
  }, [catalog, query])

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id).catch(() => {
      /* ignore clipboard errors */
    })
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-w-2xl max-h-[85vh] p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">Game Dialog Browser</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold">Game Dialog Browser</p>
            <p className="text-xs text-muted-foreground">
              {catalog
                ? `${catalog.dialogs.length} dialog flows — ${results.length} shown`
                : 'Load Core.zip to browse dialogs'}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 h-8 text-xs"
              placeholder="Search by ID, speaker, or text…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!catalog}
            />
          </div>
        </div>

        {/* Copied toast */}
        {copied && (
          <div className="mx-4 mt-2 shrink-0">
            <div className="bg-accent rounded px-3 py-1 text-xs text-accent-foreground">
              Copied: <span className="font-mono">{copied}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-2">
            {!catalog ? (
              <div className="py-12 text-center text-sm text-muted-foreground space-y-2">
                <p>Game data not loaded.</p>
                <p className="text-xs">Use Game Data → Load Core.zip in the toolbar.</p>
              </div>
            ) : results.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No dialogs match your search.
              </p>
            ) : (
              results.map((item) => (
                <DialogRow key={item.id} item={item} onCopyId={handleCopyId} />
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
