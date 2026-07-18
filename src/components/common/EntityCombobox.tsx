import { useState, useMemo } from 'react'
import { ENTITY_REGISTRIES, ENTITY_LABELS } from '@/schema/entities'
import type { EntityCategory, EntityEntry } from '@/schema/entities'
import { useCatalogStore } from '@/store/useCatalogStore'
import type { CatalogMapObject } from '@/lib/catalog/types'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronsUpDown, SlidersHorizontal } from 'lucide-react'
import MapObjectFilter, { type MapObjectFilterState, loadSavedFilter } from '@/components/catalog/MapObjectFilter'
import { CatalogIcon } from '@/lib/catalog/thumbnails'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (value: string) => void
  category: EntityCategory
  placeholder?: string
}

// ─── Hook: build the entry list from catalog or static fallback ───────────────

function useCatalogEntries(category: EntityCategory): EntityEntry[] {
  const catalog = useCatalogStore((s) => s.catalog)

  return useMemo(() => {
    if (!catalog) return ENTITY_REGISTRIES[category]

    switch (category) {
      case 'hero':
        return catalog.heroes.map((h) => ({ id: h.id, label: `${h.name}`, icon: h.icon }))
      case 'creature':
        return catalog.creatures.map((c) => ({ id: c.id, label: c.name, icon: c.icon }))
      case 'artifact':
        return catalog.artifacts.map((a) => ({ id: a.id, label: a.name, icon: a.icon }))
      case 'mapObject':
        return catalog.mapObjects.map((o) => ({ id: o.id, label: o.name }))
      case 'spell':
        return catalog.spells.map((s) => ({ id: s.id, label: s.name, icon: s.icon }))
      case 'skill':
        return catalog.skills.map((s) => ({ id: s.id, label: s.name, icon: s.icon }))
      case 'buff':
        return catalog.buffs.map((b) => ({ id: b.id, label: b.name, icon: b.icon }))
      default:
        return ENTITY_REGISTRIES[category] ?? []
    }
  }, [catalog, category])
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
export default function EntityCombobox({ value, onChange, category, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filter, setFilter] = useState<MapObjectFilterState>(() => loadSavedFilter())

  const allEntries = useCatalogEntries(category)
  const catalog = useCatalogStore((s) => s.catalog)
  const rawMapObjects = category === 'mapObject' ? catalog?.mapObjects : undefined

  const filteredByMapFilter = useMemo(
    () =>
      category === 'mapObject'
        ? applyMapObjectFilter(allEntries, rawMapObjects, filter)
        : allEntries,
    [allEntries, rawMapObjects, filter, category],
  )

  const filtered = useMemo(() => {
    if (!value) return filteredByMapFilter
    const q = value.toLowerCase()
    return filteredByMapFilter.filter(
      (e) => e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
    )
  }, [filteredByMapFilter, value])

  const isFiltered =
    category === 'mapObject' &&
    (filter.interactableOnly ||
      !Object.values(filter.categories).every(Boolean))

  const filterBadge =
    category === 'mapObject' && catalog
      ? `${filteredByMapFilter.length}/${allEntries.length}`
      : undefined

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <PopoverAnchor asChild>
            <Input
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                setOpen(true)
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
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

        <PopoverContent
          className="p-0"
          style={{ width: 'var(--radix-popover-anchor-width)' }}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
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
