// ─── Map Grid — object browser (issue #167 Phase B) ─────────────────────────
// Replaces the small sid-picker popover the "Place object" header button
// used to open: a full browser that swaps into the cell-info column,
// filterable by biome/terrain type and object type together (both narrow the
// same list — AND, not either/or), plus a name/sid search. Two browsing
// modes (`mode` state): "Objects" lists `objects[]`-placeable catalog
// templates (catalog.mapObjects) filtered by biome+type; "Units" lists real
// creatures (catalog.creatures) filtered by faction instead, for placing a
// squads[] instance. Markers/zones still have no picker.

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CatalogIcon, CreatureStatsSection, thumbnailPath } from '@/lib/catalog/thumbnails'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import type { GameCatalog, CatalogMapObject, CatalogCreature } from '@/lib/catalog/types'

// The 5 object-type filters requested — a different grouping from the
// placed-object GridGroup system (tile-index.ts): this browses catalog
// TEMPLATES (what could be placed), not placed instances, and only
// `objects[]` (type 0) is placeable here at all, so squads/zones don't apply.
// "Animals" maps to the `animals` category (roaming wildlife decorations,
// e.g. camel/scorpion/chicken) — real creature squads are a separate
// browsing mode below (`mode === 'creatures'`), not part of this filter row.
// Resources/artifacts/test/blocks have no dedicated button — they still show
// up whenever no type filter is active.
type TypeFilterKey = 'environments' | 'interactables' | 'animals' | 'fxs' | 'spawns'

const TYPE_FILTER_ORDER: TypeFilterKey[] = ['environments', 'interactables', 'animals', 'fxs', 'spawns']
const TYPE_FILTER_LABELS: Record<TypeFilterKey, string> = {
  environments: 'Decorations',
  interactables: 'Interactables',
  animals: 'Animals',
  fxs: 'F/X',
  spawns: 'Spawners',
}

type BrowseMode = 'objects' | 'creatures'

// Synthetic bucket for `CatalogCreature.fraction === 'neutral'` — monster
// creatures/dwellings use this value (Core/DB/units/units_logics/neutral/*,
// Core/DB/squads/squads_neutral/*) but there's no real "neutral" playable
// faction entry in Core/DB/fractions, so it isn't part of `catalog.factions`.
const NEUTRAL_FRACTION_ID = 'neutral'

const BIOME_ORDER: BiomeId[] = [1, 2, 3, 4, 5, 6, 7]
// Object catalog entries use their own biome string ("Desert") where tiles
// use "Sand" for the same terrain (confirmed against every real
// Core/DB/map/objects/*.json entry) — everything else matches exactly.
const BIOME_ID_TO_CATALOG_BIOME: Record<BiomeId, string> = {
  1: 'Grass', 2: 'Desert', 3: 'Deathland', 4: 'Snow', 5: 'Autumn', 6: 'Lava', 7: 'Dirt',
}

// Remembered across opens, same convention as every other Map Grid filter
// (oe-map-grid-filter, oe-map-grid-settings, etc.) — the search query is
// deliberately NOT persisted, only the two pill-button filters.
const FILTER_STORAGE_KEY = 'oe-object-browser-filter'

interface StoredFilter {
  types: TypeFilterKey[]
  biomes: BiomeId[]
  mode: BrowseMode
  fractions: string[]
}

function loadStoredFilter(): StoredFilter {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredFilter>
      return {
        types: Array.isArray(parsed.types) ? parsed.types : [],
        biomes: Array.isArray(parsed.biomes) ? parsed.biomes : [],
        mode: parsed.mode === 'creatures' ? 'creatures' : 'objects',
        fractions: Array.isArray(parsed.fractions) ? parsed.fractions : [],
      }
    }
  } catch { /* ignore */ }
  return { types: [], biomes: [], mode: 'objects', fractions: [] }
}

function saveStoredFilter(filter: StoredFilter): void {
  try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter)) } catch { /* ignore */ }
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
  /** The sid currently staged for placement, if any — highlights that row so
   *  it's clear what's active while the browser stays open (issue #167: it
   *  used to close on pick, which made stamping down several different kinds
   *  of object tedious). */
  placingSid: string | null
  onPick: (sid: string) => void
  /** The creature id currently staged for placement, if any — same
   *  highlight-while-open convention as placingSid, kept as a separate prop
   *  since a creature pick resolves to a squad-template sid at write time,
   *  not the creature's own id (see MapGridDialog's placingCreatureId). */
  placingCreatureId: string | null
  onPickCreature: (creatureId: string) => void
  onClose: () => void
}

/** Every real creature needs a matching one-unit squad template
 *  (Core/DB/squads/**\/one_tier_units_squads/) to be placeable as a squads[]
 *  instance — 142/152 real creatures have one (confirmed by direct grep
 *  against Core/DB); the rest (upgrade/campaign-only creatures) aren't
 *  placeable this way. Matching purely on "a template with exactly one unit
 *  sid, and it's this creature" — not also fraction/tier — since that single
 *  fact already uniquely identifies the right template. */
function templateForCreature(catalog: GameCatalog | null, creature: CatalogCreature) {
  return catalog?.squadTemplates.find((t) => t.unitSids.length === 1 && t.unitSids[0] === creature.id)
}

/** e.g. "human" -> "Temple" (the real in-game faction display name, resolved
 *  in catalog.factions via the same Lang loc pass as everything else) —
 *  there's no real "neutral" faction entry in Core/DB/fractions (see
 *  NEUTRAL_FRACTION_ID above), so that one bucket is hardcoded. */
function factionDisplayName(catalog: GameCatalog | null, fraction: string): string {
  if (fraction === NEUTRAL_FRACTION_ID) return 'Neutral'
  return catalog?.factions.find((f) => f.id === fraction)?.name ?? fraction
}

/** CatalogCreature.aiType is a free-form string from Core/DB's raw `ai`
 *  field, not a clean melee/ranged flag — real distinct values (grep-
 *  confirmed against every Core/DB/units/units_logics/**\/*.json): melee_type,
 *  melee_type_eater, melee_type_grouping (95+3+2 creatures), range_type,
 *  range_type_eater, range_type_melee_shooters (32+1+2), and reach_type (14 —
 *  all casters/curse-inflicters like druid/cultist/vampire/graverobber, not
 *  physical melee attackers). Bucketing reach_type as Ranged since none of
 *  those 14 need to be melee-adjacent to act — unconfirmed against real
 *  in-game UI wording, flagged rather than silently guessed. */
function unitTypeLabel(aiType: string | undefined): string | null {
  if (!aiType) return null
  if (aiType.startsWith('melee')) return 'Melee'
  if (aiType.startsWith('range') || aiType === 'reach_type') return 'Ranged'
  return null
}

export default function ObjectBrowserPanel({ catalog, placingSid, onPick, placingCreatureId, onPickCreature, onClose }: Props) {
  const initialFilter = useMemo(loadStoredFilter, [])
  const [typeFilter, setTypeFilter] = useState<Set<TypeFilterKey>>(() => new Set(initialFilter.types))
  const [biomeFilter, setBiomeFilter] = useState<Set<BiomeId>>(() => new Set(initialFilter.biomes))
  const [mode, setMode] = useState<BrowseMode>(initialFilter.mode)
  const [fractionFilter, setFractionFilter] = useState<Set<string>>(() => new Set(initialFilter.fractions))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const persist = (next: Partial<StoredFilter>) => {
    saveStoredFilter({
      types: [...typeFilter], biomes: [...biomeFilter], mode, fractions: [...fractionFilter],
      ...next,
    })
  }
  const toggleType = (t: TypeFilterKey) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      persist({ types: [...next] })
      return next
    })
  }
  const toggleBiome = (b: BiomeId) => {
    setBiomeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(b)) next.delete(b)
      else next.add(b)
      persist({ biomes: [...next] })
      return next
    })
  }
  const toggleFraction = (f: string) => {
    setFractionFilter((prev) => {
      const next = new Set(prev)
      if (next.has(f)) next.delete(f)
      else next.add(f)
      persist({ fractions: [...next] })
      return next
    })
  }
  const setModeAndPersist = (m: BrowseMode) => {
    setMode(m)
    persist({ mode: m })
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

  const creatureEntries = useMemo(() => {
    const all = catalog?.creatures ?? []
    const q = query.trim().toLowerCase()
    return all.filter((c) => {
      if (fractionFilter.size > 0 && !fractionFilter.has(c.fraction)) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalog, fractionFilter, query])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1 rounded border border-border p-0.5">
          <button
            onClick={() => setModeAndPersist('objects')}
            className={`h-5 px-2 text-xs rounded-sm transition-colors ${mode === 'objects' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Objects
          </button>
          <button
            onClick={() => setModeAndPersist('creatures')}
            className={`h-5 px-2 text-xs rounded-sm transition-colors ${mode === 'creatures' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Units
          </button>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="px-3 pt-2 pb-1.5 space-y-1.5 shrink-0 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {mode === 'objects'
              ? BIOME_ORDER.map((b) => (
                  <FilterPill key={b} active={biomeFilter.has(b)} onClick={() => toggleBiome(b)}>
                    {BIOME_NAMES[b]}
                  </FilterPill>
                ))
              : (catalog?.factions ?? []).map((f) => (
                  <FilterPill key={f.id} active={fractionFilter.has(f.id)} onClick={() => toggleFraction(f.id)}>
                    {f.name}
                  </FilterPill>
                )).concat(
                  <FilterPill key={NEUTRAL_FRACTION_ID} active={fractionFilter.has(NEUTRAL_FRACTION_ID)} onClick={() => toggleFraction(NEUTRAL_FRACTION_ID)}>
                    Neutral
                  </FilterPill>,
                )}
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
        {mode === 'objects' && (
          <div className="flex flex-wrap gap-1">
            {TYPE_FILTER_ORDER.map((t) => (
              <FilterPill key={t} active={typeFilter.has(t)} onClick={() => toggleType(t)}>
                {TYPE_FILTER_LABELS[t]}
              </FilterPill>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {mode === 'objects' ? (
          <>
            {entries.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No objects match these filters.</p>
            )}
            {entries.map((o) => {
              const row = (
                <button
                  key={o.id}
                  onClick={() => onPick(o.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                    o.id === placingSid ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <CatalogIcon iconId={o.icon} name={o.name} size={24} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{o.name}</p>
                    <p className="text-xs text-muted-foreground truncate font-mono">{o.id}</p>
                  </div>
                </button>
              )
              // Most decorations/fx/animals/blocks have no real description
              // string at all (see CatalogMapObject.description) — skip the
              // tooltip entirely rather than show an empty hover box.
              if (!o.description) return row
              return (
                <Tooltip key={o.id}>
                  <TooltipTrigger asChild>{row}</TooltipTrigger>
                  <TooltipContent side="left" className="max-w-64 space-y-1 text-left">
                    <p className="text-xs font-semibold">{o.name}</p>
                    <p className="text-xs leading-relaxed">{o.description}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </>
        ) : (
          <>
            {creatureEntries.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No creatures match these filters.</p>
            )}
            {creatureEntries.map((c) => {
              const placeable = !!templateForCreature(catalog, c)
              const portraitSrc = thumbnailPath(c.icon)
              const typeLabel = unitTypeLabel(c.aiType)
              const row = (
                <button
                  key={c.id}
                  disabled={!placeable}
                  onClick={() => onPickCreature(c.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                    !placeable ? 'opacity-40 cursor-not-allowed' : c.id === placingCreatureId ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <CatalogIcon iconId={c.icon} name={c.name} size={24} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate font-mono">{c.id}</p>
                  </div>
                </button>
              )
              return (
                <Tooltip key={c.id}>
                  <TooltipTrigger asChild>{row}</TooltipTrigger>
                  <TooltipContent side="left" className="w-64 space-y-2 text-left">
                    {portraitSrc && (
                      <img
                        src={portraitSrc}
                        alt={c.name}
                        className="block mx-auto"
                        style={{ maxWidth: 'min(160px, 90vw)', maxHeight: 'min(160px, 80vh)', objectFit: 'contain' }}
                      />
                    )}
                    <p className="text-xs font-semibold">
                      {factionDisplayName(catalog, c.fraction)} - Tier {c.tier}
                    </p>
                    {c.stats && <CreatureStatsSection stats={c.stats} />}
                    {typeLabel && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Type: </span>
                        <span className="font-semibold">{typeLabel}</span>
                      </p>
                    )}
                    {!placeable && (
                      <p className="text-xs text-amber-500">No placeable template for this creature</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
