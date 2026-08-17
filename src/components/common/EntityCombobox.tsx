import { useState, useMemo, useRef } from 'react'
import { ENTITY_REGISTRIES, ENTITY_LABELS } from '@/schema/entities'
import type { EntityCategory, EntityEntry } from '@/schema/entities'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { CatalogMapObject } from '@/lib/catalog/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronsUpDown, LayoutGrid, SlidersHorizontal } from 'lucide-react'
import MapObjectFilter, { type MapObjectFilterState, loadSavedFilter } from '@/components/catalog/MapObjectFilter'
import { CatalogIcon, PortraitThumb, heroPortraitPath } from '@/lib/catalog/thumbnails'
import HeroPickerDialog from '@/components/catalog/HeroPickerDialog'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (value: string) => void
  category: EntityCategory
  placeholder?: string
  /** Optional: restrict results to ids in this set, applied after the
   *  built-in map object category/interactable filter (e.g. "only map
   *  objects that have a matching objects_logic entry" — CustomObjectEditorDialog's
   *  from-scratch native-behavior picker). Undefined means no restriction. */
  restrictToIds?: Set<string>
}

// ─── Hook: build the entry list from catalog or static fallback ───────────────

function useCatalogEntries(category: EntityCategory): EntityEntry[] {
  const catalog = useCatalogStore((s) => s.catalog)
  // Custom artifacts (issue #150) aren't part of the Core.zip-built catalog —
  // they're scenario-local, so their display name resolves against this
  // project's own localization map, not the catalog's (game-wide) one.
  const customArtifacts = useScenarioStore((s) => s.customArtifacts)
  const localization = useScenarioStore((s) => s.localization)

  return useMemo(() => {
    if (!catalog) return ENTITY_REGISTRIES[category]

    switch (category) {
      case 'hero':
        return catalog.heroes.map((h) => ({ id: h.id, label: `${h.name}`, icon: h.icon }))
      case 'creature':
        return catalog.creatures.map((c) => ({ id: c.id, label: c.name, icon: c.icon }))
      case 'artifact': {
        const real = catalog.artifacts.map((a) => ({ id: a.id, label: a.name, icon: a.icon }))
        const custom = Object.values(customArtifacts).map((def) => {
          const nameSid = typeof def.template.name === 'string' ? def.template.name : def.id
          const icon = typeof def.template.icon === 'string' ? def.template.icon : undefined
          return { id: def.id, label: localization[nameSid] ?? nameSid, icon }
        })
        return [...real, ...custom]
      }
      case 'mapObject':
        return catalog.mapObjects.map((o) => ({ id: o.id, label: o.name, icon: o.icon }))
      case 'spell':
        return catalog.spells.map((s) => ({ id: s.id, label: s.name, icon: s.icon }))
      case 'skill':
        return catalog.skills.map((s) => ({ id: s.id, label: s.name, icon: s.icon }))
      case 'buff':
        return catalog.buffs.map((b) => ({ id: b.id, label: b.name, icon: b.icon }))
      case 'squadTemplate': {
        // Squad templates have no display name of their own — compose one
        // from fraction/tier plus the real unit names inside it (issue #143),
        // resolved via a Map rather than a per-template .find() since there
        // are ~4200 templates.
        const creatureNameById = new Map(catalog.creatures.map((c) => [c.id, c.name]))
        return catalog.squadTemplates.map((t) => {
          const units = t.unitSids.map((sid) => creatureNameById.get(sid) ?? sid).join(', ')
          const fraction = t.fraction ? t.fraction.charAt(0).toUpperCase() + t.fraction.slice(1) : 'Unknown'
          return { id: t.id, label: `${fraction} T${t.tier} — ${units || t.id}` }
        })
      }
      default:
        return ENTITY_REGISTRIES[category] ?? []
    }
  }, [catalog, category, customArtifacts, localization])
}

// ─── Map object filter helpers ────────────────────────────────────────────────

function applyMapObjectFilter(
  entries: EntityEntry[],
  rawObjects: CatalogMapObject[] | undefined,
  filter: MapObjectFilterState,
): EntityEntry[] {
  if (!rawObjects) return entries

  const allowed = new Set(
    rawObjects
      .filter((o) => {
        if (filter.interactableOnly && !o.isInteractable) return false
        if (!filter.categories[o.category]) return false
        return true
      })
      .map((o) => o.id),
  )

  return entries.filter((e) => allowed.has(e.id))
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Searchable combobox backed by catalog data (when loaded) or static fallbacks.
 * For the `mapObject` category a filter button (⚙) is shown to narrow results
 * by interactability and category.
 *
 * Display format: "Entity Name" visible, ID written to JSON.
 * Free-text entry is always accepted for forward-compatibility.
 */
export default function EntityCombobox({ value, onChange, category, placeholder, restrictToIds }: Props) {
  const [open, setOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const [filter, setFilter] = useState<MapObjectFilterState>(() => loadSavedFilter())

  const allEntries = useCatalogEntries(category)
  const catalog = useCatalogStore((s) => s.catalog)
  const rawMapObjects = category === 'mapObject' ? catalog?.mapObjects : undefined

  // Speaker portrait of the currently selected hero, if one is set and its PNG has
  // been extracted. Resolved from the hero record so a typed SID also shows art.
  const portraitIcon = useMemo(() => {
    if (category !== 'hero' || !value) return undefined
    const hero = catalog?.heroes?.find((h) => h.id === value)
    return hero?.icon ?? value
  }, [category, value, catalog])
  const portraitSrc = portraitIcon ? heroPortraitPath(portraitIcon) : null

  const filteredByMapFilter = useMemo(
    () =>
      category === 'mapObject'
        ? applyMapObjectFilter(allEntries, rawMapObjects, filter)
        : allEntries,
    [allEntries, rawMapObjects, filter, category],
  )

  const restricted = useMemo(
    () => (restrictToIds ? filteredByMapFilter.filter((e) => restrictToIds.has(e.id)) : filteredByMapFilter),
    [filteredByMapFilter, restrictToIds],
  )

  const filtered = useMemo(() => {
    if (!value) return restricted
    const q = value.toLowerCase()
    return restricted.filter(
      (e) => e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
    )
  }, [restricted, value])

  const isFiltered =
    category === 'mapObject' &&
    (filter.interactableOnly ||
      !Object.values(filter.categories).every(Boolean))

  const filterBadge =
    category === 'mapObject' && catalog
      ? `${filteredByMapFilter.length}/${allEntries.length}`
      : undefined

  // Portrait of the selected hero, shown only when there is one to show.
  //
  // It is deliberately a preview, not a button: an image beside a text field reads as
  // status, so making it the way into the browser was the same mistake as the 12px icon
  // before it — an affordance with no name. The browser is opened by the labelled
  // "Browse" button after the input. Rendering nothing when there is no portrait also
  // keeps the input full width, which matters in the dense parameter grid.
  const heroPortrait = category === 'hero' && portraitSrc && (
    <PortraitThumb
      iconId={portraitIcon}
      name={value}
      size={26}
      previewSize={224}
      resolve={heroPortraitPath}
      className="flex h-7 w-7 items-center justify-center rounded border border-border bg-card"
    />
  )

  return (
    <>
      <div className="flex items-center gap-1.5">
        {heroPortrait}
        <Popover open={open} onOpenChange={setOpen}>
          <div className="relative flex-1 min-w-0">
            <PopoverAnchor asChild>
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  onChange(e.target.value)
                  setOpen(true)
                }}
                onFocus={() => setOpen(true)}
                placeholder={placeholder}
                className={`h-7 text-xs ${category === 'mapObject' ? 'pr-14' : 'pr-7'}`}
              />
            </PopoverAnchor>

            {/* Map object filter button */}
            {category === 'mapObject' && (
              <button
                type="button"
                className={`absolute right-7 top-1/2 -translate-y-1/2 h-5 flex items-center gap-0.5 px-1 rounded text-[10px] font-medium transition-colors ${
                  isFiltered
                    ? 'text-primary hover:text-primary/80'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title={`Filter map objects${filterBadge ? ` (${filterBadge})` : ''}`}
                onClick={(e) => { e.stopPropagation(); setFilterOpen(true) }}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {filterBadge && <span>{filterBadge}</span>}
              </button>
            )}

            <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none opacity-60" />
          </div>

          {/* A named button outside the input, because two rounds of subtler
              affordances (a 12px glyph, then the portrait itself) both went unnoticed,
              and the row inside the dropdown only helps once the dropdown is open. */}
          {category === 'hero' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs"
              onClick={() => setPickerOpen(true)}
              title="Browse heroes grouped by faction"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Browse
            </Button>
          )}

          <PopoverContent
            className="p-0"
            style={{ width: 'var(--radix-popover-anchor-width)' }}
            onOpenAutoFocus={(e) => e.preventDefault()}
            // Radix's own outside-interaction detection is what actually
            // closes this now — a click on the input itself needs to stay
            // excluded (without it, focusing/re-clicking the input while
            // open registers as "outside" and immediately re-closes the
            // popover Radix just opened, since the anchor is a sibling of
            // PopoverContent, not inside it). Everything else — a genuine
            // outside click, Escape, tabbing away — closes normally.
            // Previously this blanket-prevented ALL outside interaction and
            // relied on the input's onBlur (with a setTimeout) as the only
            // close path instead; that also fired on any focus loss,
            // including dragging the list's own scrollbar or, in some
            // browsers, mouse-wheel scrolling over it, closing the dropdown
            // mid-scroll — the only way left to browse it was to type a
            // search term. Scrolling never reaches this handler at all
            // (it's an interaction inside PopoverContent), so it can no
            // longer close the popover either way.
            onInteractOutside={(e) => {
              if (e.target === inputRef.current) e.preventDefault()
            }}
          >
            <Command shouldFilter={false}>
              <CommandList>
                {/* Named entry point for the picker, pinned above the results.
                    Clicking a hero field already opens this list, so putting the
                    browser here costs no screen space and needs no tooltip — the
                    previous icon-only affordances were simply never found. Outside
                    the filtered group, so typing cannot hide it. */}
                {category === 'hero' && (
                  <CommandGroup className="border-b border-border">
                    <CommandItem
                      value="__browse_heroes__"
                      onSelect={() => {
                        setOpen(false)
                        setPickerOpen(true)
                      }}
                      className="flex items-center gap-1.5 text-xs py-1.5 font-medium"
                    >
                      <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      Browse heroes by faction…
                    </CommandItem>
                  </CommandGroup>
                )}

                <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
                  {filtered.length === 0 && allEntries.length > 0
                    ? `No matching ${ENTITY_LABELS[category]}`
                    : `No ${ENTITY_LABELS[category]} — load Core.zip via Game Data`}
                </CommandEmpty>
                <CommandGroup>
                  {filtered.map((entry) => (
                    <CommandItem
                      key={entry.id}
                      value={entry.id}
                      onSelect={() => {
                        onChange(entry.id)
                        setOpen(false)
                      }}
                      className="flex justify-between gap-2 text-xs py-1"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {entry.icon && (
                          <CatalogIcon size={16} iconId={entry.icon} name={entry.label} />
                        )}
                        <span className="truncate">{entry.label}</span>
                      </span>
                      <span className="text-xs text-muted-foreground font-mono truncate max-w-[45%]">
                        {entry.id}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Hero picker. Hero mode (the default) lists only primary hero tiles, so heroId is
          always set; the fallback keeps this honest rather than writing `undefined`. */}
      {category === 'hero' && (
        <HeroPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          value={value}
          onSelect={(entry) => onChange(entry.heroId ?? entry.sublabel)}
        />
      )}

      {/* Map object filter dialog */}
      {category === 'mapObject' && (
        <MapObjectFilter
          open={filterOpen}
          onOpenChange={setFilterOpen}
          filter={filter}
          onApply={setFilter}
          totalCount={allEntries.length}
          filteredCount={filteredByMapFilter.length}
        />
      )}
    </>
  )
}
