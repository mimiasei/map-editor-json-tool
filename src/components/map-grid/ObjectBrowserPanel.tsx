// ─── Map Grid — object browser (issue #167 Phase B) ─────────────────────────
// Replaces the small sid-picker popover the "Place object" header button
// used to open: a full browser that swaps into the cell-info column,
// filterable by biome/terrain type and object type together (both narrow the
// same list — AND, not either/or), plus a name/sid search. Only
// `objects[]`-placeable map objects (catalog.mapObjects) are listed here —
// squads/markers have no picker yet (see issue #167).

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CatalogIcon } from '@/lib/catalog/thumbnails'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import type { GameCatalog, CatalogMapObject } from '@/lib/catalog/types'

// The 5 object-type filters requested — a different grouping from the
// placed-object GridGroup system (tile-index.ts): this browses catalog
// TEMPLATES (what could be placed), not placed instances, and only
// `objects[]` (type 0) is placeable here at all, so squads/zones don't apply.
// "Units" maps to the `animals` category (roaming wildlife decorations,
// e.g. camel/scorpion/chicken) — the closest match to what a mapmaker would
// call "units" among placeable map objects, since actual creature squads
// aren't part of this picker. Resources/artifacts/test/blocks have no
// dedicated button — they still show up whenever no type filter is active.
type TypeFilterKey = 'environments' | 'interactables' | 'animals' | 'fxs' | 'spawns'

const TYPE_FILTER_ORDER: TypeFilterKey[] = ['environments', 'interactables', 'animals', 'fxs', 'spawns']
const TYPE_FILTER_LABELS: Record<TypeFilterKey, string> = {
  environments: 'Decorations',
  interactables: 'Interactables',
  animals: 'Units',
  fxs: 'F/X',
  spawns: 'Spawners',
}

const BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]
// Object catalog entries use their own biome string ("Desert") where tiles
// use "Sand" for the same terrain (confirmed against every real
// Core/DB/map/objects/*.json entry) — everything else matches exactly.
const BIOME_ID_TO_CATALOG_BIOME: Record<BiomeId, string> = {
  1: 'Grass', 2: 'Desert', 3: 'Deathland', 4: 'Snow', 5: 'Autumn', 6: 'Lava', 7: 'Dirt',
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`h-6 px-2 text-xs rounded border transition-colors ${
        active
          ? 'bg-background text-foreground border-border'
          : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

interface Props {
  catalog: GameCatalog | null
  onPick: (sid: string) => void
  onClose: () => void
}

export default function ObjectBrowserPanel({ catalog, onPick, onClose }: Props) {
  const [typeFilter, setTypeFilter] = useState<Set<TypeFilterKey>>(new Set())
  const [biomeFilter, setBiomeFilter] = useState<Set<BiomeId>>(new Set())
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const toggleType = (t: TypeFilterKey) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }
  const toggleBiome = (b: BiomeId) => {
    setBiomeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(b)) next.delete(b)
      else next.add(b)
      return next
    })
  }

  const entries = useMemo(() => {
    const all = catalog?.mapObjects ?? []
    const q = query.trim().toLowerCase()
    const wantedBiomes = biomeFilter.size > 0 ? [...biomeFilter].map((b) => BIOME_ID_TO_CATALOG_BIOME[b]) : null
    return all.filter((o: CatalogMapObject) => {
      if (typeFilter.size > 0 && !typeFilter.has(o.category as TypeFilterKey)) return false
      if (wantedBiomes && (!o.biome || !wantedBiomes.includes(o.biome))) return false
      if (q && !o.name.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalog, typeFilter, biomeFilter, query])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span className="text-sm font-semibold">Place Object</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 pt-2 pb-1.5 space-y-1.5 shrink-0 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {BIOME_ORDER.map((b) => (
              <FilterPill key={b} active={biomeFilter.has(b)} onClick={() => toggleBiome(b)}>
                {BIOME_NAMES[b]}
              </FilterPill>
            ))}
          </div>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={query ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6 shrink-0"
                title="Search by sid or name"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-1.5" data-nodrag>
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sid / name"
                className="h-7 text-xs"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPE_FILTER_ORDER.map((t) => (
            <FilterPill key={t} active={typeFilter.has(t)} onClick={() => toggleType(t)}>
              {TYPE_FILTER_LABELS[t]}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {entries.length === 0 && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No objects match these filters.</p>
        )}
        {entries.map((o) => (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors"
          >
            <CatalogIcon iconId={o.icon} name={o.name} size={24} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{o.name}</p>
              <p className="text-xs text-muted-foreground truncate font-mono">{o.id}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
