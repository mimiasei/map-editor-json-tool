// ─── Select a real game RMG template (issue #210, Stage 1) ──────────────────
// Picks one of the ~60 real game templates bundled as Tauri resources
// (rmg-template-catalog.ts) — its own zone/connection topology (and, for
// Stage 3a/3c, its own per-zone terrain-shape layout) then drives
// generation instead of this generator's own fixed ring, per
// GenerateRandomMapDialog.tsx's own "Use game template" entry point.

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCatalogStore } from '@/store/useCatalogStore'
import { listBundledGameTemplates, readBundledGameTemplateJson, type BundledGameTemplateInfo } from '@/lib/rmg/rmg-template-catalog'
import { logError } from '@/lib/logger'
import TemplateDetailsDialog from '@/components/common/TemplateDetailsDialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (template: { fileName: string; name: string; json: string }) => void
}

export default function SelectGameTemplateDialog({ open, onOpenChange, onSelect }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const [templates, setTemplates] = useState<BundledGameTemplateInfo[] | null>(null)
  const [search, setSearch] = useState('')
  const [loadingFileName, setLoadingFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [detailsTarget, setDetailsTarget] = useState<BundledGameTemplateInfo | null>(null)

  useEffect(() => {
    if (!open || !catalog) return
    setError(null)
    void listBundledGameTemplates(catalog).then((result) => {
      if (result === null) { setError('Not available outside the desktop app.'); return }
      setTemplates(result)
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [open, catalog])

  const filtered = (templates ?? []).filter((t) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  })

  const handlePick = async (info: BundledGameTemplateInfo) => {
    setLoadingFileName(info.fileName)
    try {
      const json = await readBundledGameTemplateJson(info.fileName)
      if (!json) throw new Error('Could not read this template file.')
      onSelect({ fileName: info.fileName, name: info.name, json })
      onOpenChange(false)
    } catch (e) {
      logError(`Failed to load game template "${info.name}": ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoadingFileName(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="p-0 gap-0 overflow-hidden" defaultWidth={520} defaultHeight={560} minWidth={420} minHeight={360} storageKey="select-game-template">
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">Use a Game Template</DialogTitle>
        </DraggableDialogDragHandle>

        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="h-8 text-sm"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Real map templates from the game itself — each defines its own zone
            layout and connections. Size/obstacle/treasure/etc. sliders still
            apply on top of the chosen template's own shape.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {error && <p className="text-xs text-destructive px-2 py-4 text-center">{error}</p>}
          {!error && templates === null && <p className="text-xs text-muted-foreground px-2 py-4 text-center">Loading templates…</p>}
          {!error && templates !== null && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No templates match "{search}".</p>
          )}
          {filtered.map((t) => (
            <div
              key={t.fileName}
              className="w-full flex items-stretch rounded border border-border hover:border-foreground/30 transition-colors"
            >
              <button
                type="button"
                onClick={() => void handlePick(t)}
                disabled={loadingFileName !== null}
                className="flex-1 min-w-0 text-left hover:bg-accent/50 transition-colors px-3 py-2 rounded-l disabled:opacity-60"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {t.playerCount} player{t.playerCount === 1 ? '' : 's'}
                  </span>
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                )}
                {loadingFileName === t.fileName && <p className="text-xs text-muted-foreground mt-1">Loading…</p>}
              </button>
              <button
                type="button"
                onClick={() => setDetailsTarget(t)}
                title="View template details"
                className="shrink-0 px-2.5 flex items-center justify-center text-muted-foreground border-l border-border hover:text-foreground hover:bg-accent/50 transition-colors rounded-r"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DraggableDialogContent>

      <TemplateDetailsDialog
        open={detailsTarget !== null}
        onOpenChange={(o) => { if (!o) setDetailsTarget(null) }}
        fileName={detailsTarget?.fileName ?? null}
        displayName={detailsTarget?.name ?? ''}
      />
    </Dialog>
  )
}
