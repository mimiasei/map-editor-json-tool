// ─── RMG interactable selector (issue #238) ─────────────────────────────────
// A browsable grid of every real interactable object the RMG could place —
// icon + display name + a checkbox, all checked (enabled) by default. The
// subcategory pills at the top only filter what's DISPLAYED here, same as
// the Map Grid's own interactable pill filter (ObjectBrowserPanel.tsx reuses
// the identical interactable-subcategories.ts data this does) — unchecking a
// subcategory never disables those objects, it just hides them from view.
// Unchecking an individual object's own checkbox is what actually adds it to
// the RMG's exclusion set (`disabledSids`, threaded through to
// zone-population.ts's content-pool roll and zone-interactables.ts's own
// pickInteractableSid — see GenerateRandomMapDialog.tsx's own wiring).
//
// `campaign_`-prefixed and `custom_`-prefixed sids are never shown at all —
// per the issue's own requirement, these aren't real RMG-eligible content
// (confirmed: neither prefix appears anywhere in object-variety.ts's curated
// interactable tiers nor in any real Core/generator/content_lists/*.json
// entry this generator's content-pool roll can produce).
//
// Four more subcategories are excluded too, found during real-generation
// verification rather than guessed: `dwellings`/`mines` are placed by
// zone-population.ts's own MANDATORY per-zone population (every player
// zone needs its dwelling + wood/ore/gold mine; every neutral zone needs
// its own cycling mine) — a completely separate code path from the
// discretionary treasure/interactable roll this dialog's `disabledSids`
// actually gates, confirmed by a real generation run where disabling every
// other interactable still placed every mine/dwelling regardless.
// `portals` (`portal_*`) are placed only by the separate "Use portals"/
// Islands reconnection features (zone-islands.ts's own `PORTAL_SIDS`), never
// through this roll either. `unitTrade` (`unit_trade_lab_*`) isn't placed
// by the RMG through ANY path today — confirmed absent from every real
// Core/generator/content_lists/*.json entry and from object-variety.ts's own
// curated tiers. Showing any of these four as toggleable would be a
// checkbox that visibly does nothing — same "campaignOnly" reasoning.

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import {
  INTERACTABLE_SUBCATEGORY_ORDER,
  INTERACTABLE_SUBCATEGORY_LABELS,
  resolveInteractableSubcategory,
  type InteractableSubcategory,
} from '@/lib/map-grid/interactable-subcategories'

/** Not part of the RMG's own discretionary interactable-choice roll (see this
 *  file's own header comment for the real-generation evidence behind each) —
 *  excluded from the browsable grid and its category filter entirely, not
 *  just unchecked, since a visible-but-inert toggle would be misleading. */
const NON_BROWSABLE_SUBCATEGORIES = new Set<InteractableSubcategory>(['campaignOnly', 'dwellings', 'mines', 'portals', 'unitTrade'])
const BROWSABLE_SUBCATEGORY_ORDER = INTERACTABLE_SUBCATEGORY_ORDER.filter((c) => !NON_BROWSABLE_SUBCATEGORIES.has(c))

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sids currently excluded from the RMG's own interactable picks. */
  disabledSids: Set<string>
  onChange: (next: Set<string>) => void
}

export default function InteractableSelectorDialog({ open, onOpenChange, disabledSids, onChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const [search, setSearch] = useState('')
  const [displayFilter, setDisplayFilter] = useState<Record<InteractableSubcategory, boolean>>(
    () => Object.fromEntries(BROWSABLE_SUBCATEGORY_ORDER.map((c) => [c, true])) as Record<InteractableSubcategory, boolean>,
  )

  const allInteractables = useMemo(
    () => (catalog?.mapObjects ?? [])
      .filter((o) => o.category === 'interactables' && !o.id.startsWith('campaign_') && !o.id.startsWith('custom_') && !NON_BROWSABLE_SUBCATEGORIES.has(resolveInteractableSubcategory(o.id)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  )

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const bySub = new Map<InteractableSubcategory, typeof allInteractables>()
    for (const o of allInteractables) {
      const sub = resolveInteractableSubcategory(o.id)
      if (!displayFilter[sub]) continue
      if (q && !o.name.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) continue
      if (!bySub.has(sub)) bySub.set(sub, [])
      bySub.get(sub)!.push(o)
    }
    return BROWSABLE_SUBCATEGORY_ORDER
      .filter((sub) => bySub.has(sub))
      .map((sub) => ({ sub, items: bySub.get(sub)! }))
  }, [allInteractables, search, displayFilter])

  const shownCount = groups.reduce((n, g) => n + g.items.length, 0)
  const enabledCount = allInteractables.length - disabledSids.size

  const toggleOne = (sid: string) => {
    const next = new Set(disabledSids)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    onChange(next)
  }

  const allEnabled = disabledSids.size === 0
  const toggleAll = (enable: boolean) => {
    onChange(enable ? new Set() : new Set(allInteractables.map((o) => o.id)))
  }

  const toggleSubFilter = (sub: InteractableSubcategory) => {
    setDisplayFilter((prev) => ({ ...prev, [sub]: !prev[sub] }))
  }
  const allSubShown = BROWSABLE_SUBCATEGORY_ORDER.every((c) => displayFilter[c])
  const setAllSubFilter = (shown: boolean) => {
    setDisplayFilter(Object.fromEntries(BROWSABLE_SUBCATEGORY_ORDER.map((c) => [c, shown])) as Record<InteractableSubcategory, boolean>)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={820}
        defaultHeight={660}
        minWidth={560}
        minHeight={420}
        storageKey="rmg-interactable-selector"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">RMG interactables</DialogTitle>

        <DraggableDialogDragHandle className="flex items-center gap-2 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <span className="text-sm font-semibold shrink-0">RMG interactables</span>
          <div className="relative flex-1 min-w-0" data-nodrag>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or sid…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {enabledCount}/{allInteractables.length} enabled
          </span>
        </DraggableDialogDragHandle>

        <div className="flex items-center gap-3 px-4 py-2 border-b border-border shrink-0" data-nodrag>
          <div className="flex items-center gap-1.5 shrink-0">
            <Checkbox id="rmg-interactables-select-all" checked={allEnabled} onCheckedChange={(v) => toggleAll(Boolean(v))} />
            <Label htmlFor="rmg-interactables-select-all" className="text-xs cursor-pointer font-medium">
              Select all
            </Label>
          </div>
          <div className="w-px self-stretch bg-border" />
          <ScrollArea className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setAllSubFilter(!allSubShown)}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                  allSubShown ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/50'
                }`}
              >
                All categories
              </button>
              {BROWSABLE_SUBCATEGORY_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleSubFilter(c)}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    displayFilter[c] ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/50'
                  }`}
                >
                  {INTERACTABLE_SUBCATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {allInteractables.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No interactables to browse — load Core.zip via Game Data.
              </p>
            )}
            {allInteractables.length > 0 && shownCount === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing matches the current search/category filter.
              </p>
            )}

            {groups.map(({ sub, items }) => (
              <div key={sub} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {INTERACTABLE_SUBCATEGORY_LABELS[sub]}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
                  <div className="flex-1 border-t border-border/60" />
                </div>

                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
                  {items.map((o) => {
                    const enabled = !disabledSids.has(o.id)
                    return (
                      <label
                        key={o.id}
                        className={`flex items-center gap-2 rounded border p-2 cursor-pointer transition-colors ${
                          enabled ? 'border-border bg-card hover:bg-accent/50' : 'border-border/50 bg-muted/30 opacity-60 hover:opacity-90'
                        }`}
                      >
                        <Checkbox checked={enabled} onCheckedChange={() => toggleOne(o.id)} />
                        <CatalogIcon iconId={o.icon} name={o.name} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{o.name}</p>
                          <p className="text-[9px] text-muted-foreground truncate font-mono">{o.id}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border shrink-0" data-nodrag>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
