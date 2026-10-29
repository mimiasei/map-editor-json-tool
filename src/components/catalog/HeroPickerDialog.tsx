// ─── Portrait browser ─────────────────────────────────────────────────────────
// Portrait-first alternative to typing a SID or an icon path: entries grouped by faction in
// the game's own order, showing the same art dialogs use. The comboboxes are still there —
// this is a second way in, not a replacement, so free text and unknown values keep working.
//
// Two modes:
//   'hero'     — one tile per hero, returns the hero SID (quest parameter fields).
//   'portrait' — every portrait the game ships, returns the avatar icon path (Dialog Editor).

import { useMemo, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { STATIC_HEROES } from '@/lib/catalog/static-catalog'
import { PortraitThumb, thumbnailPath, heroPortraitPath } from '@/lib/catalog/thumbnails'
import { factionDisplayName, groupByFaction } from '@/lib/factions'
import { buildPortraitEntries, type PortraitEntry } from '@/lib/catalog/portraits'
import { assetLeafName, heroAvatarIcon } from '@/lib/catalog/icon-requests'
import HeroPickerFilter, {
  loadPortraitFilter,
  portraitFilterAdmits,
  type PortraitFilterState,
} from '@/components/catalog/HeroPickerFilter'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search } from '@/components/ui/icons'
import { useTranslation } from 'react-i18next'

export type PickerMode = 'hero' | 'portrait'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Highlighted in the grid: a hero SID in hero mode, an icon path in portrait mode. */
  value?: string
  onSelect: (entry: PortraitEntry) => void
  mode?: PickerMode
  /** Overrides the header. */
  title?: string
  /** Restrict to one faction's entries (raw catalog faction id, e.g. "human") and hide the
   *  picker's own faction filter row — used when the caller already knows the faction (e.g.
   *  the Map Grid's spawner Faction field) so there's nothing left to filter by. */
  lockedFaction?: string
}

export default function HeroPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
  mode = 'hero',
  title,
  lockedFaction,
}: Props) {
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)
  const customHeroes = useScenarioStore((s) => s.customHeroes)
  const localization = useScenarioStore((s) => s.localization)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PortraitFilterState>(loadPortraitFilter)

  const heading = title ?? (mode === 'portrait' ? t('catalog.heroPickerDialog.choosePortrait') : t('catalog.heroPickerDialog.chooseHero'))

  // Candidate entries for this mode.
  //
  // Hero mode still works without Core.zip by falling back to the bundled hero list. The
  // portrait list cannot: it is built from the dialog references only Core.zip carries.
  const entries = useMemo<PortraitEntry[]>(() => {
    // Custom heroes are scenario-local clones, so neither the catalog nor the static list has them.
    // Hero mode only: a clone reuses its source hero's art, so portrait mode would list it twice.
    const custom: PortraitEntry[] =
      mode === 'hero'
        ? Object.values(customHeroes).map((def) => {
            const nameSid = typeof def.definition.name === 'string' ? def.definition.name : ''
            const icon = typeof def.definition.icon === 'string' ? def.definition.icon : ''
            return {
              key: `custom-hero:${def.heroSid}`,
              icon: heroAvatarIcon(icon),
              name: localization[nameSid] ?? def.heroSid,
              sublabel: def.heroSid,
              kind: 'hero' as const,
              fraction: typeof def.definition.fraction === 'string' ? def.definition.fraction : '',
              heroId: def.heroSid,
              heroIcon: icon,
            }
          })
        : []
    if (catalog) {
      const all = buildPortraitEntries(catalog)
      const real = mode === 'portrait' ? all : all.filter((e) => e.kind === 'hero' && !e.variant)
      return [...real, ...custom]
    }
    if (mode === 'portrait') return []
    return [
      ...STATIC_HEROES.map((h) => ({
        key: `hero:${h.id}`,
        icon: heroAvatarIcon(h.icon),
        name: h.name,
        sublabel: h.id,
        kind: 'hero' as const,
        fraction: h.fraction,
        heroId: h.id,
        heroIcon: h.icon,
      })),
      ...custom,
    ]
  }, [catalog, mode, customHeroes, localization])

  const factionOf = (e: PortraitEntry) =>
    factionDisplayName(e.fraction, catalog?.factions) || 'Neutral'

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matching = entries.filter((e) => {
      if (
        q &&
        !e.name.toLowerCase().includes(q) &&
        !e.sublabel.toLowerCase().includes(q) &&
        !assetLeafName(e.icon).toLowerCase().includes(q)
      ) {
        return false
      }
      if (lockedFaction !== undefined && e.fraction !== lockedFaction) return false
      return portraitFilterAdmits(filter, factionOf(e), e.kind)
    })
    return groupByFaction(matching, factionOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search, catalog, filter, lockedFaction])

  const shown = groups.reduce((n, g) => n + g.items.length, 0)

  const handlePick = (entry: PortraitEntry) => {
    onSelect(entry)
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
        <DialogTitle className="sr-only">{heading}</DialogTitle>

        <DraggableDialogDragHandle className="flex items-center gap-2 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <span className="text-sm font-semibold shrink-0">{heading}</span>
          <div className="relative flex-1 min-w-0" data-nodrag>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('catalog.heroPickerDialog.searchNameSIDOrIcon')}
              className="pl-7 h-7 text-xs"
            />
          </div>
          {/* Both numbers, so a filter that hides everything is legible rather than puzzling */}
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {shown === entries.length ? entries.length : `${shown}/${entries.length}`}
          </span>
          {lockedFaction === undefined && (
            <div data-nodrag>
              <HeroPickerFilter
                value={filter}
                onChange={setFilter}
                showKinds={mode === 'portrait'}
              />
            </div>
          )}
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-4">
            {entries.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('catalog.heroPickerDialog.noPortraitsToBrowseLoad')}
              </p>
            )}

            {entries.length > 0 && shown === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('catalog.heroPickerDialog.nothingMatchesTheCurrentSearch')}
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
                  {items.map((entry) => {
                    // Portrait mode selects by icon path, hero mode by SID.
                    const selected =
                      mode === 'portrait' ? entry.icon === value : entry.heroId === value
                    return (
                      <button
                        key={entry.key}
                        type="button"
                        onClick={() => handlePick(entry)}
                        title={`${entry.sublabel}${entry.variant ? ` · ${entry.variant} art` : ''}`}
                        className={`flex flex-col items-center gap-1 rounded border p-2 text-center transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-accent/50'
                        }`}
                      >
                        {/* Portrait mode resolves the icon path directly — thumbnailPath
                            matches on the leaf, so dialogue portraits and hero <icon>_large
                            both work. Hero mode keeps heroPortraitPath so it still falls
                            back to the plain card icon when the large one is missing. */}
                        {mode === 'portrait' ? (
                          <PortraitThumb
                            iconId={entry.icon}
                            name={entry.name}
                            size={72}
                            height={72}
                            previewSize={280}
                            resolve={thumbnailPath}
                          />
                        ) : (
                          <PortraitThumb
                            iconId={entry.heroIcon}
                            name={entry.name}
                            size={72}
                            height={72}
                            previewSize={280}
                            resolve={heroPortraitPath}
                          />
                        )}
                        <span className="w-full truncate text-xs font-medium leading-tight">
                          {entry.name}
                        </span>
                        <span className="w-full truncate font-mono text-[9px] text-muted-foreground">
                          {entry.variant ? `· ${entry.variant}` : entry.sublabel}
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
