// ─── Generic icon browser (issue #150) ─────────────────────────────────────────
// A searchable grid of catalog icon thumbnails to pick from. Not
// artifact-specific in its own implementation — takes a plain list of
// {id, label} candidates, so any future icon-bearing entity can reuse it the
// same way CustomArtifactEditorDialog does.

import { useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { cn } from '@/lib/utils'

export interface IconBrowserOption {
  /** The icon SID this option resolves to when picked. */
  id: string
  /** Display label shown under the thumbnail and used for text search. */
  label: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  options: IconBrowserOption[]
  /** Currently-assigned icon id, highlighted in the grid if present. */
  currentIconId?: string
  onPick: (iconId: string) => void
}

export default function IconBrowserDialog({
  open,
  onOpenChange,
  title = 'Choose an icon',
  options,
  currentIconId,
  onPick,
}: Props) {
  const [search, setSearch] = useState('')

  // Multiple items can share the same icon (e.g. several magic scroll
  // variants) — dedupe by icon id so the grid doesn't repeat thumbnails.
  const deduped = useMemo(() => {
    const seen = new Set<string>()
    const result: IconBrowserOption[] = []
    for (const o of options) {
      if (!o.id || seen.has(o.id)) continue
      seen.add(o.id)
      result.push(o)
    }
    return result
  }, [options])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return deduped
    return deduped.filter(
      (o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q),
    )
  }, [deduped, search])

  const handlePick = (iconId: string) => {
    onPick(iconId)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="shrink-0"
        />

        <div className="grid grid-cols-6 gap-2 overflow-y-auto pt-1">
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => handlePick(o.id)}
              title={o.label}
              className={cn(
                'flex flex-col items-center gap-1 rounded-md border p-2 transition-colors',
                o.id === currentIconId
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent hover:border-border hover:bg-accent/50',
              )}
            >
              <CatalogIcon iconId={o.id} name={o.label} size={40} />
              <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                {o.label}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-6 py-6 text-center text-xs text-muted-foreground">
              No matching icons.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
