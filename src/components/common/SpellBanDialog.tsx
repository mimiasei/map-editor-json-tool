// ─── RMG banned-spell selector ──────────────────────────────────────────────
// Every spell in the catalog with a checkbox: checked = banned on the
// generated map (`banInfoData.bannedMagics`). One tab per magic school
// (Daylight, Nightshade, Primal, Arcane, Neutral), each showing how many of its
// spells are banned, and the spells inside a tab grouped by rank — the usual
// way spell books are laid out. Typing in the search box looks through all
// schools at once.

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
import type { CatalogSpell } from '@/lib/catalog/types'

/** Display order of the schools; anything else lands in "Other" at the end. */
const SCHOOL_ORDER = ['Daylight', 'Nightshade', 'Primal', 'Arcane', 'Neutral']
const OTHER_SCHOOL = 'Other'
/** The tab that lists every school at once. */
const ALL_SCHOOLS = 'All'

function schoolOf(raw: string | undefined): string {
  const s = (raw ?? '').trim().toLowerCase()
  return SCHOOL_ORDER.find((o) => o.toLowerCase() === s) ?? OTHER_SCHOOL
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Spell sids banned on the generated map. */
  bannedSids: Set<string>
  onChange: (next: Set<string>) => void
}

export default function SpellBanDialog({ open, onOpenChange, bannedSids, onChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)
  const [search, setSearch] = useState('')
  const [activeSchool, setActiveSchool] = useState<string | null>(null)
  /** Schools switched off by the filter chips (All tab and search only). */
  const [hiddenSchools, setHiddenSchools] = useState<Set<string>>(() => new Set())

  const spells = useMemo(
    () => [...(catalog?.spells ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.name.localeCompare(b.name)),
    [catalog],
  )
  const bySchool = useMemo(() => {
    const map = new Map<string, CatalogSpell[]>()
    for (const s of spells) {
      const school = schoolOf(s.school)
      if (!map.has(school)) map.set(school, [])
      map.get(school)!.push(s)
    }
    return map
  }, [spells])
  const schools = [...SCHOOL_ORDER, OTHER_SCHOOL].filter((s) => bySchool.has(s))
  const current = activeSchool && bySchool.has(activeSchool) ? activeSchool : ALL_SCHOOLS

  const q = search.trim().toLowerCase()
  const searching = q !== ''
  // A school tab shows just that school by rank; the All tab (and any search)
  // spans every school, narrowed by the school filter chips.
  const spansSchools = searching || current === ALL_SCHOOLS
  const visible = (spansSchools ? spells.filter((s) => !hiddenSchools.has(schoolOf(s.school))) : bySchool.get(current) ?? []).filter(
    (s) => !searching || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
  )
  const byHeading = new Map<string, CatalogSpell[]>()
  for (const s of visible) {
    const key = spansSchools ? schoolOf(s.school) : s.rank !== undefined ? `Rank ${s.rank}` : 'Other'
    if (!byHeading.has(key)) byHeading.set(key, [])
    byHeading.get(key)!.push(s)
  }
  const groups = [...byHeading.entries()]

  const toggleOne = (sid: string) => {
    const next = new Set(bannedSids)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    onChange(next)
  }
  const setMany = (list: CatalogSpell[], banned: boolean) => {
    const next = new Set(bannedSids)
    for (const s of list) { if (banned) next.add(s.id); else next.delete(s.id) }
    onChange(next)
  }
  const allVisibleBanned = visible.length > 0 && visible.every((s) => bannedSids.has(s.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={820}
        defaultHeight={660}
        minWidth={560}
        minHeight={420}
        storageKey="rmg-spell-ban-selector"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Banned spells</DialogTitle>

        <DraggableDialogDragHandle className="flex items-center gap-2 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <span className="text-sm font-semibold shrink-0">Banned spells</span>
          <div className="relative flex-1 min-w-0" data-nodrag>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all schools by name or sid…" className="pl-7 h-7 text-xs" />
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{bannedSids.size} banned</span>
        </DraggableDialogDragHandle>

        <div role="tablist" className="flex items-end gap-0.5 px-4 pt-2 border-b border-border shrink-0 overflow-x-auto" data-nodrag>
          <button
            type="button"
            role="tab"
            aria-selected={!searching && current === ALL_SCHOOLS}
            onClick={() => { setActiveSchool(ALL_SCHOOLS); setSearch('') }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 -mb-px whitespace-nowrap transition-colors ${
              !searching && current === ALL_SCHOOLS ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40'
            }`}
          >
            All
            <span className={`rounded px-1 text-[10px] tabular-nums ${bannedSids.size > 0 ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              {bannedSids.size}/{spells.length}
            </span>
          </button>
          {schools.map((school) => {
            const list = bySchool.get(school)!
            const bannedHere = list.filter((s) => bannedSids.has(s.id)).length
            const active = !searching && school === current
            return (
              <button
                key={school}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setActiveSchool(school); setSearch('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40'
                }`}
              >
                {school}
                <span className={`rounded px-1 text-[10px] tabular-nums ${bannedHere > 0 ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                  {bannedHere}/{list.length}
                </span>
              </button>
            )
          })}
        </div>

        {spansSchools && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border shrink-0 flex-wrap" data-nodrag>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Schools</span>
            {schools.map((school) => {
              const on = !hiddenSchools.has(school)
              return (
                <button
                  key={school}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHiddenSchools((prev) => {
                    const next = new Set(prev)
                    if (next.has(school)) next.delete(school)
                    else next.add(school)
                    return next
                  })}
                  className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                    on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground line-through hover:bg-accent/50'
                  }`}
                >
                  {school}
                </button>
              )
            })}
            {hiddenSchools.size > 0 && (
              <button type="button" onClick={() => setHiddenSchools(new Set())} className="text-[11px] px-1 text-muted-foreground hover:text-foreground underline">
                Show all
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border shrink-0" data-nodrag>
          <Checkbox id="ban-visible-spells" checked={allVisibleBanned} onCheckedChange={(v) => setMany(visible, Boolean(v))} disabled={visible.length === 0} />
          <Label htmlFor="ban-visible-spells" className="text-xs cursor-pointer">
            {searching ? 'Ban all matches' : current === ALL_SCHOOLS ? 'Ban all shown spells' : `Ban all ${current} spells`}
          </Label>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {spells.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No spells to browse — load Core.zip via Game Data.</p>
            )}
            {spells.length > 0 && visible.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No spell matches the search.</p>
            )}

            {groups.map(([heading, items]) => (
              <div key={heading} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{heading}</span>
                  <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
                  <div className="flex-1 border-t border-border/60" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                  {items.map((s) => {
                    const banned = bannedSids.has(s.id)
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-2 rounded border p-2 cursor-pointer transition-colors ${
                          banned ? 'border-destructive/50 bg-destructive/10 hover:bg-destructive/15' : 'border-border bg-card hover:bg-accent/50'
                        }`}
                      >
                        <Checkbox checked={banned} onCheckedChange={() => toggleOne(s.id)} />
                        <CatalogIcon iconId={s.icon} name={s.name} size={28} />
                        <p className="flex-1 min-w-0 text-[9px] font-medium">{s.name}</p>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border shrink-0" data-nodrag>
          <Button size="sm" variant="outline" onClick={() => onChange(new Set())} disabled={bannedSids.size === 0}>Unban all</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
