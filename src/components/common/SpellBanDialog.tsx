// ─── RMG banned-spell selector ──────────────────────────────────────────────
// Every spell with a checkbox: checked = banned on the generated map
// (`banInfoData.bannedMagics`). School, type (battle / world) and tier come from
// src/data/spell-index.json (built from the game's DB/magics files); the
// catalog is only used for the icons.
//
// One tab per magic school (Daylight, Nightshade, Primal, Arcane, Neutral) plus
// an All tab, each showing how many of its spells are banned. Chips narrow the
// list by type and tier everywhere, and by school on the All tab. Typing in the
// search box looks through all schools at once.

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, X } from '@/components/ui/icons'
import { useCatalogStore } from '@/store/useCatalogStore'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import spellIndex from '@/data/spell-index.json'

interface IndexedSpell {
  sid: string
  name: string
  school: string
  type: 'battle' | 'world'
  tier: number
}
const SPELLS = spellIndex as IndexedSpell[]

/** Display order of the schools. */
const SCHOOLS = ['Daylight', 'Nightshade', 'Primal', 'Arcane', 'Neutral'].filter((s) => SPELLS.some((sp) => sp.school === s))
const TYPES: { id: IndexedSpell['type']; label: string }[] = [{ id: 'battle', label: 'Battle' }, { id: 'world', label: 'World' }]
const TIERS = [...new Set(SPELLS.map((s) => s.tier))].sort((a, b) => a - b)
/** The tab that lists every school at once. */
const ALL_SCHOOLS = 'All'

/** A set with `value` added or removed. */
function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** The ban box: empty, or a muted red X when banned (a ban reads better as an X than a checkmark). */
function BanMark({ banned }: { banned: boolean }) {
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${banned ? 'border-destructive/60 bg-destructive/10' : 'border-input'}`}>
      {banned && <X className="h-3 w-3 text-destructive/70" strokeWidth={3} />}
    </span>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
        on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground line-through hover:bg-accent/50'
      }`}
    >
      {children}
    </button>
  )
}

function ChipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
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
  const [activeSchool, setActiveSchool] = useState<string>(ALL_SCHOOLS)
  /** Values switched off by the filter chips. */
  const [hiddenSchools, setHiddenSchools] = useState<Set<string>>(() => new Set())
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(() => new Set())
  const [hiddenTiers, setHiddenTiers] = useState<Set<number>>(() => new Set())

  const iconBySid = useMemo(() => new Map((catalog?.spells ?? []).map((s) => [s.id, s.icon])), [catalog])

  const q = search.trim().toLowerCase()
  const searching = q !== ''
  // A school tab shows just that school; the All tab (and any search) spans
  // every school, narrowed by the school chips.
  const spansSchools = searching || activeSchool === ALL_SCHOOLS
  const visible = SPELLS.filter((s) =>
    (spansSchools ? !hiddenSchools.has(s.school) : s.school === activeSchool) &&
    !hiddenTypes.has(s.type) && !hiddenTiers.has(s.tier) &&
    (!searching || s.name.toLowerCase().includes(q) || s.sid.toLowerCase().includes(q)),
  )

  // Sections: by school on the All tab and in search, by tier inside one school.
  const sections = new Map<string, IndexedSpell[]>()
  for (const s of visible) {
    const key = spansSchools ? s.school : `Tier ${s.tier}`
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(s)
  }

  const setMany = (list: IndexedSpell[], banned: boolean) => {
    const next = new Set(bannedSids)
    for (const s of list) { if (banned) next.add(s.sid); else next.delete(s.sid) }
    onChange(next)
  }
  const filtersActive = hiddenSchools.size > 0 || hiddenTypes.size > 0 || hiddenTiers.size > 0
  const allVisibleBanned = visible.length > 0 && visible.every((s) => bannedSids.has(s.sid))
  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-xs border-b-2 -mb-px whitespace-nowrap transition-colors ${
      active ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40'
    }`
  const countBadge = (banned: number, total: number) => (
    <span className={`rounded px-1 text-[10px] tabular-nums ${banned > 0 ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
      {banned}/{total}
    </span>
  )

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
            aria-selected={!searching && activeSchool === ALL_SCHOOLS}
            onClick={() => { setActiveSchool(ALL_SCHOOLS); setSearch('') }}
            className={tabClass(!searching && activeSchool === ALL_SCHOOLS)}
          >
            All
            {countBadge(SPELLS.filter((s) => bannedSids.has(s.sid)).length, SPELLS.length)}
          </button>
          {SCHOOLS.map((school) => {
            const list = SPELLS.filter((s) => s.school === school)
            const active = !searching && activeSchool === school
            return (
              <button key={school} type="button" role="tab" aria-selected={active} onClick={() => { setActiveSchool(school); setSearch('') }} className={tabClass(active)}>
                {school}
                {countBadge(list.filter((s) => bannedSids.has(s.sid)).length, list.length)}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2 border-b border-border shrink-0" data-nodrag>
          {spansSchools && (
            <ChipRow label="School">
              {SCHOOLS.map((school) => (
                <Chip key={school} on={!hiddenSchools.has(school)} onClick={() => setHiddenSchools((p) => toggled(p, school))}>{school}</Chip>
              ))}
            </ChipRow>
          )}
          <ChipRow label="Type">
            {TYPES.map((t) => (
              <Chip key={t.id} on={!hiddenTypes.has(t.id)} onClick={() => setHiddenTypes((p) => toggled(p, t.id))}>{t.label}</Chip>
            ))}
          </ChipRow>
          <ChipRow label="Tier">
            {TIERS.map((tier) => (
              <Chip key={tier} on={!hiddenTiers.has(tier)} onClick={() => setHiddenTiers((p) => toggled(p, tier))}>{tier}</Chip>
            ))}
          </ChipRow>
          {/* Always rendered (just invisible) so hiding a chip never changes the line's width. */}
          <button
            type="button"
            onClick={() => { setHiddenSchools(new Set()); setHiddenTypes(new Set()); setHiddenTiers(new Set()) }}
            className={`text-[11px] px-1 text-muted-foreground hover:text-foreground underline ${filtersActive ? '' : 'invisible'}`}
          >
            Reset
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border shrink-0" data-nodrag>
          <button
            type="button"
            role="checkbox"
            aria-checked={allVisibleBanned}
            disabled={visible.length === 0}
            onClick={() => setMany(visible, !allVisibleBanned)}
            className="flex items-center gap-1.5 text-xs disabled:opacity-50"
          >
            <BanMark banned={allVisibleBanned} />
            {searching ? 'Ban all matches' : activeSchool === ALL_SCHOOLS ? 'Ban all shown spells' : `Ban all shown ${activeSchool} spells`}
            <span className="text-[10px] text-muted-foreground tabular-nums">({visible.length})</span>
          </button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {visible.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No spell matches the search and filters.</p>
            )}

            {[...sections.entries()].map(([heading, items]) => (
              <div key={heading} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{heading}</span>
                  <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
                  <div className="flex-1 border-t border-border/60" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                  {items.map((s) => {
                    const banned = bannedSids.has(s.sid)
                    return (
                      <button
                        key={s.sid}
                        type="button"
                        role="checkbox"
                        aria-checked={banned}
                        title={s.sid}
                        onClick={() => onChange(toggled(bannedSids, s.sid))}
                        className={`flex items-center gap-2 rounded border p-2 text-left cursor-pointer transition-colors ${
                          banned ? 'border-destructive/50 bg-destructive/10 hover:bg-destructive/15' : 'border-border bg-card hover:bg-accent/50'
                        }`}
                      >
                        <BanMark banned={banned} />
                        <CatalogIcon iconId={iconBySid.get(s.sid) ?? s.sid} name={s.name} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-medium">{s.name}</p>
                          <p className="text-[8px] text-muted-foreground">
                            {s.type === 'world' ? 'World' : 'Battle'}{spansSchools ? ` · Tier ${s.tier}` : ''}
                          </p>
                        </div>
                      </button>
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
