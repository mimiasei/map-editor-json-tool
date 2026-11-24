// ─── Squad template browser ───────────────────────────────────────────────────
// Browses every squad template in Core.zip (DB/squads/**, ~4200) by faction and tier, with a search over the
// creature names and the template id. A second way in next to the combobox, like the portrait browser: typing a
// sid still works. Used by the squad pickers (SpawnSquad / SpawnSquadNPC, a city's starting squads).

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, SlidersHorizontal } from '@/components/ui/icons'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { localName } from '@/lib/catalog/local-name'
import { factionDisplayName, factionLabel, factionSortIndex, groupByFaction } from '@/lib/factions'
import { useCatalogStore } from '@/store/useCatalogStore'
import FilterRows, { type FilterGroup, groupAdmits, isGroupActive, makeFilterGroup, mergeFilterGroup } from '@/components/catalog/FilterRows'
import { useTranslation } from 'react-i18next'

const STORAGE_KEY = 'oe-squad-picker-filter'
// Rows drawn at once: all ~4200 would make the dialog sluggish, and nobody scans that many; the search and filters narrow it.
const MAX_ROWS = 300

interface SquadFilterState { factions: FilterGroup; tiers: FilterGroup }

function loadFilter(): Partial<SquadFilterState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Partial<SquadFilterState>
  } catch { /* unreadable or blocked storage: defaults */ }
  return {}
}

interface Row {
  id: string
  faction: string
  tier: number
  units: string
  icon?: string
}

export interface SquadPickerEntry { id: string; label: string }

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: string
  onSelect: (sid: string) => void
  /** Choices pinned above the templates (the Random choice of SpawnSquad). */
  extraEntries?: SquadPickerEntry[]
}

export default function SquadPickerDialog({ open, onOpenChange, value, onSelect, extraEntries }: Props) {
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)
  const [search, setSearch] = useState('')
  const [saved, setSaved] = useState(loadFilter)

  const rows = useMemo<Row[]>(() => {
    if (!catalog) return []
    const creatures = new Map(catalog.creatures.map((c) => [c.id, c]))
    return catalog.squadTemplates.map((tpl) => ({
      id: tpl.id,
      faction: factionDisplayName(tpl.fraction, catalog.factions) || 'Neutral',
      tier: tpl.tier,
      units: tpl.unitSids.map((sid) => { const c = creatures.get(sid); return c ? localName(catalog, 'creatures', c) : sid }).join(', '),
      icon: creatures.get(tpl.unitSids[0])?.icon,
    }))
  }, [catalog])

  const factionKeys = useMemo(() => [...new Set(rows.map((r) => r.faction))].sort((a, b) => factionSortIndex(a) - factionSortIndex(b) || a.localeCompare(b)), [rows])
  const tierKeys = useMemo(() => [...new Set(rows.map((r) => String(r.tier)))].sort((a, b) => Number(a) - Number(b)), [rows])
  const filter: SquadFilterState = {
    factions: mergeFilterGroup(makeFilterGroup(factionKeys), saved.factions),
    tiers: mergeFilterGroup(makeFilterGroup(tierKeys), saved.tiers),
  }
  const update = (key: keyof SquadFilterState) => (g: FilterGroup) => {
    const next = { ...filter, [key]: g }
    setSaved(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }
  const reset = () => { setSaved({}); try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } }

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) =>
      groupAdmits(filter.factions, r.faction) && groupAdmits(filter.tiers, String(r.tier)) &&
      (!q || r.id.toLowerCase().includes(q) || r.units.toLowerCase().includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, saved, factionKeys, tierKeys])
  const groups = useMemo(() => groupByFaction(matching.slice(0, MAX_ROWS), (r) => r.faction), [matching])

  const pick = (sid: string) => { onSelect(sid); onOpenChange(false) }
  const rowClass = (selected: boolean) => `flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs transition-colors ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-accent/50'}`
  const filterActive = isGroupActive(filter.factions) || isGroupActive(filter.tiers)
  const heading = t('catalog.squadPickerDialog.title')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={640}
        defaultHeight={640}
        minWidth={460}
        minHeight={360}
        storageKey="squad-picker"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{heading}</DialogTitle>

        <DraggableDialogDragHandle className="flex items-center gap-2 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <span className="text-sm font-semibold shrink-0">{heading}</span>
          <div className="relative flex-1 min-w-0" data-nodrag>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('catalog.squadPickerDialog.search')} className="pl-7 h-7 text-xs" />
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {matching.length === rows.length ? rows.length : `${matching.length}/${rows.length}`}
          </span>
          <div data-nodrag>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-7 w-7 shrink-0" title={t('catalog.squadPickerDialog.filter')}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {filterActive && <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3 space-y-4 text-sm" align="end">
                <FilterRows label={t('common.statsDialog.faction')} group={filter.factions} keys={factionKeys} labelFor={(k) => factionLabel(k, catalog)} onChange={update('factions')} />
                <FilterRows label={t('catalog.squadPickerDialog.tier')} group={filter.tiers} keys={tierKeys} labelFor={(k) => `T${k}`} onChange={update('tiers')} />
                <div className="pt-1 border-t border-border">
                  <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={reset}>{t('shared.resetFilters')}</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-3">
            {extraEntries && extraEntries.length > 0 && (
              <div className="space-y-1">
                {extraEntries.map((e) => (
                  <button key={e.id} type="button" onClick={() => pick(e.id)} className={rowClass(e.id === value)}>
                    <span className="font-medium">{e.label}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{e.id}</span>
                  </button>
                ))}
              </div>
            )}
            {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('catalog.squadPickerDialog.noneLoaded')}</p>}
            {rows.length > 0 && matching.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('catalog.squadPickerDialog.noMatch')}</p>}
            {groups.map(({ faction, items }) => (
              <div key={faction} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{factionLabel(faction, catalog)}</span>
                  <div className="flex-1 border-t border-border/60" />
                </div>
                {items.map((r) => (
                  <button key={r.id} type="button" onClick={() => pick(r.id)} className={rowClass(r.id === value)}>
                    <CatalogIcon iconId={r.icon} name={r.units} size={24} className="shrink-0" />
                    <span className="shrink-0 font-semibold tabular-nums">T{r.tier}</span>
                    <span className="min-w-0 flex-1 truncate">{r.units}</span>
                    <span className="max-w-[40%] truncate font-mono text-[10px] text-muted-foreground">{r.id}</span>
                  </button>
                ))}
              </div>
            ))}
            {matching.length > MAX_ROWS && (
              <p className="py-2 text-center text-xs text-muted-foreground">{t('catalog.squadPickerDialog.refine', { shown: MAX_ROWS, total: matching.length })}</p>
            )}
          </div>
        </ScrollArea>
      </DraggableDialogContent>
    </Dialog>
  )
}
