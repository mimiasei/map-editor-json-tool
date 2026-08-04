// ─── Hero picker ──────────────────────────────────────────────────────────────
// Portrait-first alternative to typing a hero SID: heroes grouped by faction in the
// game's own order, showing the same speaker portrait dialogs use. The combobox is
// still there — this is a second way in, not a replacement, so free text and unknown
// SIDs keep working.

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { useCatalogStore } from '@/store/useCatalogStore'
import { STATIC_HEROES } from '@/lib/catalog/static-catalog'
import { PortraitThumb, heroPortraitPath } from '@/lib/catalog/thumbnails'
import { factionDisplayName, groupByFaction } from '@/lib/factions'
import type { CatalogHero } from '@/lib/catalog/types'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Currently selected hero SID, highlighted in the grid. */
  value?: string
  onSelect: (heroId: string) => void
}

export default function HeroPickerDialog({ open, onOpenChange, value, onSelect }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const [search, setSearch] = useState('')

  // Fall back to the bundled list so the picker is never empty before Core.zip loads.
  const heroes: CatalogHero[] = useMemo(
    () => (catalog?.heroes?.length ? catalog.heroes : STATIC_HEROES),
    [catalog],
  )

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matching = q
      ? heroes.filter(
          (h) => h.name.toLowerCase().includes(q) || h.id.toLowerCase().includes(q),
        )
      : heroes
    return groupByFaction(matching, (h) => factionDisplayName(h.fraction, catalog?.factions))
  }, [heroes, search, catalog])

  const total = groups.reduce((n, g) => n + g.items.length, 0)

  const handlePick = (id: string) => {
    onSelect(id)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={780}
        defaultHeight={640}
        minWidth={520}
        minHeight={400}
        storageKey="hero-picker"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Choose a hero</DialogTitle>

        <DraggableDialogDragHandle className="flex items-center gap-3 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <span className="text-sm font-semibold shrink-0">Choose a hero</span>
          <div className="relative flex-1 min-w-0" data-nodrag>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or SID…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">{total}</span>
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {total === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No heroes match “{search}”.
              </p>
            )}

            {groups.map(({ faction, items }) => (
              <div key={faction} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {faction}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
                  <div className="flex-1 border-t border-border/60" />
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2">
                  {items.map((hero) => {
                    const selected = hero.id === value
                    return (
                      <button
                        key={hero.id}
                        type="button"
                        onClick={() => handlePick(hero.id)}
                        title={hero.id}
                        className={`flex flex-col items-center gap-1 rounded border p-2 text-center transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-accent/50'
                        }`}
                      >
                        <PortraitThumb
                          iconId={hero.icon}
                          name={hero.name}
                          size={72}
                          height={72}
                          previewSize={280}
                          resolve={heroPortraitPath}
                        />
                        <span className="w-full truncate text-xs font-medium leading-tight">
                          {hero.name}
                        </span>
                        <span className="w-full truncate font-mono text-[9px] text-muted-foreground">
                          {hero.id}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DraggableDialogContent>
    </Dialog>
  )
}
