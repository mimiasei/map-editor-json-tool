// ─── RMG banned-artifact selector ───────────────────────────────────────────
// Every artifact with a checkbox: checked = banned on the generated map
// (`banInfoData.bannedItems`). Same layout as SpellBanDialog. Name, slot and
// rarity come from src/data/artifacts.json; the catalog is only used for icons.
//
// One tab per kind (Equipment, Artifacts, Scrolls) plus an All tab, each showing
// how many of its artifacts are banned. Chips narrow the list by rarity and by
// slot. Typing in the search box looks through everything at once.

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, X } from '@/components/ui/icons'
import { useCatalogStore } from '@/store/useCatalogStore'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import artifactData from '@/data/artifacts.json'
import { useTranslation } from 'react-i18next'

interface IndexedArtifact {
  sid: string
  name: string
  slot: string
  rarity?: string
  kind: string
}

/** Display order of the tabs. */
const KINDS = ['Equipment', 'Artifacts', 'Scrolls']
/** The tab that lists every kind at once. */
const ALL_KINDS = 'All'

function kindOf(slot: string): string {
  if (slot.startsWith('Scrolls')) return 'Scrolls'
  if (slot === 'Artifacts' || slot === 'Unic Slot') return 'Artifacts'
  return 'Equipment'
}

const ARTIFACTS: IndexedArtifact[] = (artifactData as { sid: string; name: string; slot: string; rarity?: string }[])
  .map((a) => ({ ...a, kind: kindOf(a.slot) }))
  .sort((a, b) => a.name.localeCompare(b.name))
const SLOTS = [...new Set(ARTIFACTS.map((a) => a.slot))]
const RARITIES = [...new Set(ARTIFACTS.map((a) => a.rarity ?? 'Unknown'))]

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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Artifact sids banned on the generated map. */
  bannedSids: Set<string>
  onChange: (next: Set<string>) => void
}

export default function ArtifactBanDialog({ open, onOpenChange, bannedSids, onChange }: Props) {
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)
  const [search, setSearch] = useState('')
  const [activeKind, setActiveKind] = useState<string>(ALL_KINDS)
  /** Values switched off by the filter chips. */
  const [hiddenRarities, setHiddenRarities] = useState<Set<string>>(() => new Set())
  const [hiddenSlots, setHiddenSlots] = useState<Set<string>>(() => new Set())

  const iconBySid = useMemo(() => new Map((catalog?.artifacts ?? []).map((a) => [a.id, a.icon])), [catalog])

  const q = search.trim().toLowerCase()
  const searching = q !== ''
  // A kind tab shows just that kind; the All tab (and any search) spans every kind.
  const spansKinds = searching || activeKind === ALL_KINDS
  const visible = ARTIFACTS.filter((a) =>
    (spansKinds || a.kind === activeKind) &&
    !hiddenRarities.has(a.rarity ?? 'Unknown') && !hiddenSlots.has(a.slot) &&
    (!searching || a.name.toLowerCase().includes(q) || a.sid.toLowerCase().includes(q)),
  )
  // Slots offered as chips: those of the shown kind.
  const slotChips = SLOTS.filter((s) => spansKinds || kindOf(s) === activeKind)

  // Sections: by kind on the All tab and in search, by slot inside one kind.
  const sections = new Map<string, IndexedArtifact[]>()
  for (const a of visible) {
    const key = spansKinds ? a.kind : a.slot
    if (!sections.has(key)) sections.set(key, [])
    sections.get(key)!.push(a)
  }

  const setMany = (list: IndexedArtifact[], banned: boolean) => {
    const next = new Set(bannedSids)
    for (const a of list) { if (banned) next.add(a.sid); else next.delete(a.sid) }
    onChange(next)
  }
  const filtersActive = hiddenRarities.size > 0 || hiddenSlots.size > 0
  const allVisibleBanned = visible.length > 0 && visible.every((a) => bannedSids.has(a.sid))
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
        storageKey="rmg-artifact-ban-selector"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{t('shared.bannedArtifacts')}</DialogTitle>

        <DraggableDialogDragHandle className="flex items-center gap-2 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <span className="text-sm font-semibold shrink-0">{t('shared.bannedArtifacts')}</span>
          <div className="relative flex-1 min-w-0" data-nodrag>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.artifactBanDialog.searchAllArtifactsByName')} className="pl-7 h-7 text-xs" />
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{t('shared.banned', { size: bannedSids.size })}</span>
        </DraggableDialogDragHandle>

        <div role="tablist" className="flex items-end gap-0.5 px-4 pt-2 border-b border-border shrink-0 overflow-x-auto" data-nodrag>
          <button
            type="button"
            role="tab"
            aria-selected={!searching && activeKind === ALL_KINDS}
            onClick={() => { setActiveKind(ALL_KINDS); setSearch('') }}
            className={tabClass(!searching && activeKind === ALL_KINDS)}
          >
            {t('shared.all')}
            {countBadge(ARTIFACTS.filter((a) => bannedSids.has(a.sid)).length, ARTIFACTS.length)}
          </button>
          {KINDS.map((kind) => {
            const list = ARTIFACTS.filter((a) => a.kind === kind)
            const active = !searching && activeKind === kind
            return (
              <button key={kind} type="button" role="tab" aria-selected={active} onClick={() => { setActiveKind(kind); setSearch('') }} className={tabClass(active)}>
                {kind}
                {countBadge(list.filter((a) => bannedSids.has(a.sid)).length, list.length)}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2 border-b border-border shrink-0" data-nodrag>
          <ChipRow label={t('common.artifactBanDialog.rarity')}>
            {RARITIES.map((r) => (
              <Chip key={r} on={!hiddenRarities.has(r)} onClick={() => setHiddenRarities((p) => toggled(p, r))}>{r}</Chip>
            ))}
          </ChipRow>
          <ChipRow label={t('common.artifactBanDialog.slot')}>
            {slotChips.map((s) => (
              <Chip key={s} on={!hiddenSlots.has(s)} onClick={() => setHiddenSlots((p) => toggled(p, s))}>{s}</Chip>
            ))}
          </ChipRow>
          {/* Always rendered (just invisible) so hiding a chip never changes the line's width. */}
          <button
            type="button"
            onClick={() => { setHiddenRarities(new Set()); setHiddenSlots(new Set()) }}
            className={`text-[11px] px-1 text-muted-foreground hover:text-foreground underline ${filtersActive ? '' : 'invisible'}`}
          >
            {t('shared.reset')}
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
            {searching ? t('common.artifactBanDialog.banAllMatches') : activeKind === ALL_KINDS ? t('common.artifactBanDialog.banAllShownArtifacts') : `Ban all shown ${activeKind.toLowerCase()}`}
            <span className="text-[10px] text-muted-foreground tabular-nums">({visible.length})</span>
          </button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {visible.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('common.artifactBanDialog.noArtifactMatchesTheSearch')}</p>
            )}

            {[...sections.entries()].map(([heading, items]) => (
              <div key={heading} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{heading}</span>
                  <span className="text-[10px] text-muted-foreground/60">({items.length})</span>
                  <div className="flex-1 border-t border-border/60" />
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2">
                  {items.map((a) => {
                    const banned = bannedSids.has(a.sid)
                    return (
                      <button
                        key={a.sid}
                        type="button"
                        role="checkbox"
                        aria-checked={banned}
                        title={a.sid}
                        onClick={() => onChange(toggled(bannedSids, a.sid))}
                        className={`flex items-center gap-2 rounded border p-2 text-left cursor-pointer transition-colors ${
                          banned ? 'border-destructive/50 bg-destructive/10 hover:bg-destructive/15' : 'border-border bg-card hover:bg-accent/50'
                        }`}
                      >
                        <BanMark banned={banned} />
                        <CatalogIcon iconId={iconBySid.get(a.sid) ?? a.sid} name={a.name} size={28} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-medium">{a.name}</p>
                          <p className="text-[8px] text-muted-foreground">
                            {a.slot}{a.rarity ? ` · ${a.rarity}` : ''}
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
          <Button size="sm" variant="outline" onClick={() => onChange(new Set())} disabled={bannedSids.size === 0}>{t('shared.unbanAll')}</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>{t('shared.done')}</Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
