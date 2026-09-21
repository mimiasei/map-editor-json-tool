// ─── Map Grid — object browser (issue #167 Phase B) ─────────────────────────
// Replaces the small sid-picker popover the "Place object" header button
// used to open: a full browser that swaps into the cell-info column,
// filterable by biome/terrain type and object type together (both narrow the
// same list — AND, not either/or), plus a name/sid search. Two browsing
// modes (`mode` state): "Objects" lists `objects[]`-placeable catalog
// templates (catalog.mapObjects) filtered by biome+type; "Units" lists real
// creatures (catalog.creatures) filtered by faction+tier instead, for
// placing a squads[] instance. Markers/zones still have no picker.
//
// Filters render as dropdown pills (multi-select checkboxes, "All" row at
// top) mirroring the Map Grid's own Browse-mode pill+chevron pattern
// (MapGridDialog.tsx) — Decorations/Interactables get the same split-button
// shape (main pill toggles the whole category, chevron opens its
// sub-category dropdown, reusing decoration-subcategories.ts /
// interactable-subcategories.ts verbatim) since only those two have a real
// sub-category breakdown. Animals/F/X/Spawners/Resources have no such
// breakdown, so they stay plain pills on their own row — but single-select
// (only one of the four active at a time), unlike Decorations/Interactables
// which each toggle independently. Biome and (Units-mode) Tier are pure
// multi-value dropdowns (default: everything selected) with no separate
// master toggle.

import { useMemo, useState } from 'react'
import { Search, Settings, X, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CatalogIcon, CreatureStatsSection, thumbnailPath } from '@/lib/catalog/thumbnails'
import { BIOME_NAMES, type BiomeId } from '@/lib/map-grid/terrain-colors'
import {
  DECORATION_SUBCATEGORY_ORDER,
  DECORATION_SUBCATEGORY_LABELS,
  resolveDecorationSubcategory,
  type DecorationSubcategory,
} from '@/lib/map-grid/decoration-subcategories'
import {
  INTERACTABLE_SUBCATEGORY_ORDER,
  INTERACTABLE_SUBCATEGORY_LABELS,
  resolveInteractableSubcategory,
  type InteractableSubcategory,
} from '@/lib/map-grid/interactable-subcategories'
import type { GameCatalog, CatalogMapObject, CatalogCreature } from '@/lib/catalog/types'

// The 6 object-type filters requested — a different grouping from the
// placed-object GridGroup system (tile-index.ts): this browses catalog
// TEMPLATES (what could be placed), not placed instances, and only
// `objects[]` (type 0) is placeable here at all, so squads/zones don't apply.
// "Animals" maps to the `animals` category (roaming wildlife decorations,
// e.g. camel/scorpion/chicken) — real creature squads are a separate
// browsing mode below (`mode === 'creatures'`), not part of this filter row.
// Artifacts/test/blocks have no dedicated button — they still show up
// whenever no type filter is active.
type TypeFilterKey = 'environments' | 'interactables' | 'animals' | 'fxs' | 'spawns' | 'resources'

const TYPE_FILTER_LABELS: Record<TypeFilterKey, string> = {
  environments: 'Decorations',
  interactables: 'Interactables',
  animals: 'Animals',
  fxs: 'F/X',
  spawns: 'Spawners',
  resources: 'Resources',
}

// Decorations/Interactables get the split-button (pill + chevron dropdown);
// these four have no sub-category breakdown of their own, so they stay
// plain single-click pills like every filter used to be.
const PLAIN_TYPE_FILTER_ORDER: TypeFilterKey[] = ['animals', 'fxs', 'spawns', 'resources']

// The Decorations dropdown reuses decoration-subcategories.ts verbatim (same
// list Browse mode's own "Decorations" chevron shows) minus its 'animals'/
// 'fx' entries — those two are only ever returned by resolveDecorationSubcategory
// when the real category is literally 'animals'/'fxs', which can't happen
// here since the Decorations pill only ever matches `category === 'environments'`
// objects; they're covered by this panel's own separate Animals/F/X pills instead.
type PanelDecorationSubcategory = Exclude<DecorationSubcategory, 'animals' | 'fx'>
const PANEL_DECORATION_SUBCATEGORY_ORDER: PanelDecorationSubcategory[] = DECORATION_SUBCATEGORY_ORDER.filter(
  (c): c is PanelDecorationSubcategory => c !== 'animals' && c !== 'fx',
)

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

// Real creature tiers run 1-8; only neutral-fraction creatures (e.g. lich
// dragon) ever reach tier 8 — listed uniformly here rather than special-cased,
// since the dropdown just needs every value that can occur.
const TIER_ORDER = [1, 2, 3, 4, 5, 6, 7, 8]

// Remembered across opens, same convention as every other Map Grid filter
// (oe-map-grid-filter, oe-map-grid-settings, etc.) — the search query is
// deliberately NOT persisted, only the filter/settings state below.
const FILTER_STORAGE_KEY = 'oe-object-browser-filter'

interface StoredFilter {
  types: TypeFilterKey[]
  plainType: TypeFilterKey | null
  biomes: Record<BiomeId, boolean>
  mode: BrowseMode
  fractions: string[]
  tiers: Record<number, boolean>
  decorationSub: Record<PanelDecorationSubcategory, boolean>
  interactableSub: Record<InteractableSubcategory, boolean>
  showCampaign: boolean
  showCustom: boolean
  showNoTemplate: boolean
}

// Sub-category (and Biome/Tier) filters default every key to `true` ("All"
// selected) — any key missing from a stored (older) save also defaults
// `true`, so a newly-added sub-category doesn't silently start hidden for
// existing users.
function buildSubFilterDefaults<T extends string | number>(
  order: T[],
  stored: Partial<Record<T, boolean>> | undefined,
): Record<T, boolean> {
  return Object.fromEntries(order.map((k) => [k, stored?.[k] !== false])) as Record<T, boolean>
}

function loadStoredFilter(): StoredFilter {
  let parsed: Partial<StoredFilter> = {}
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY)
    if (raw) parsed = JSON.parse(raw) as Partial<StoredFilter>
  } catch { /* ignore */ }
  return {
    types: Array.isArray(parsed.types) ? parsed.types : [],
    plainType: PLAIN_TYPE_FILTER_ORDER.includes(parsed.plainType as TypeFilterKey) ? (parsed.plainType as TypeFilterKey) : null,
    biomes: buildSubFilterDefaults(BIOME_ORDER, parsed.biomes as Partial<Record<BiomeId, boolean>> | undefined),
    mode: parsed.mode === 'creatures' ? 'creatures' : 'objects',
    fractions: Array.isArray(parsed.fractions) ? parsed.fractions : [],
    tiers: buildSubFilterDefaults(TIER_ORDER, parsed.tiers as Partial<Record<number, boolean>> | undefined),
    decorationSub: buildSubFilterDefaults(PANEL_DECORATION_SUBCATEGORY_ORDER, parsed.decorationSub),
    interactableSub: buildSubFilterDefaults(INTERACTABLE_SUBCATEGORY_ORDER, parsed.interactableSub),
    showCampaign: parsed.showCampaign === true,
    showCustom: parsed.showCustom === true,
    showNoTemplate: parsed.showNoTemplate === true,
  }
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

/** The pill styling shared by every dropdown trigger and split-button half
 *  below — `active` mirrors FilterPill's own highlight rule. */
function pillClass(active: boolean, extra: string): string {
  return `h-6 text-xs transition-colors border ${extra} ${
    active
      ? 'bg-background text-foreground border-border'
      : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground'
  }`
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
  const [plainTypeFilter, setPlainTypeFilter] = useState<TypeFilterKey | null>(initialFilter.plainType)
  const [biomeFilter, setBiomeFilter] = useState<Record<BiomeId, boolean>>(initialFilter.biomes)
  const [mode, setMode] = useState<BrowseMode>(initialFilter.mode)
  const [fractionFilter, setFractionFilter] = useState<Set<string>>(() => new Set(initialFilter.fractions))
  const [tierFilter, setTierFilter] = useState<Record<number, boolean>>(initialFilter.tiers)
  const [decorationSubFilter, setDecorationSubFilter] = useState<Record<PanelDecorationSubcategory, boolean>>(
    initialFilter.decorationSub,
  )
  const [interactableSubFilter, setInteractableSubFilter] = useState<Record<InteractableSubcategory, boolean>>(
    initialFilter.interactableSub,
  )
  const [showCampaign, setShowCampaign] = useState<boolean>(initialFilter.showCampaign)
  const [showCustom, setShowCustom] = useState<boolean>(initialFilter.showCustom)
  const [showNoTemplate, setShowNoTemplate] = useState<boolean>(initialFilter.showNoTemplate)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const persist = (next: Partial<StoredFilter>) => {
    saveStoredFilter({
      types: [...typeFilter], plainType: plainTypeFilter, biomes: biomeFilter, mode, fractions: [...fractionFilter],
      tiers: tierFilter, decorationSub: decorationSubFilter, interactableSub: interactableSubFilter,
      showCampaign, showCustom, showNoTemplate,
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
  // Animals/F/X/Spawners/Resources are single-select (only one active at a
  // time, unlike Decorations/Interactables which toggle independently) —
  // clicking the currently-active one deselects it back to "show all four".
  const togglePlainType = (t: TypeFilterKey) => {
    setPlainTypeFilter((prev) => {
      const next = prev === t ? null : t
      persist({ plainType: next })
      return next
    })
  }
  // Biome/Tier use the same Record-of-booleans "All" convention as the
  // Decorations/Interactables sub-category dropdowns above (default every
  // key true) rather than a Set — a Set can't distinguish "everything
  // selected" from "nothing selected" when both display as "All" collapsed
  // to empty, which is exactly what made the "All" checkbox unable to
  // actually deselect everything.
  const toggleBiome = (b: BiomeId) => {
    setBiomeFilter((prev) => {
      const next = { ...prev, [b]: !prev[b] }
      persist({ biomes: next })
      return next
    })
  }
  const setAllBiomes = (value: boolean) => {
    const next = Object.fromEntries(BIOME_ORDER.map((b) => [b, value])) as Record<BiomeId, boolean>
    setBiomeFilter(next)
    persist({ biomes: next })
  }
  const toggleTier = (t: number) => {
    setTierFilter((prev) => {
      const next = { ...prev, [t]: !prev[t] }
      persist({ tiers: next })
      return next
    })
  }
  const setAllTiers = (value: boolean) => {
    const next = Object.fromEntries(TIER_ORDER.map((t) => [t, value])) as Record<number, boolean>
    setTierFilter(next)
    persist({ tiers: next })
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
  const toggleDecorationSub = (c: PanelDecorationSubcategory) => {
    setDecorationSubFilter((prev) => {
      const next = { ...prev, [c]: !prev[c] }
      persist({ decorationSub: next })
      return next
    })
  }
  const setAllDecorationSub = (value: boolean) => {
    const next = Object.fromEntries(
      PANEL_DECORATION_SUBCATEGORY_ORDER.map((c) => [c, value]),
    ) as Record<PanelDecorationSubcategory, boolean>
    setDecorationSubFilter(next)
    persist({ decorationSub: next })
  }
  const toggleInteractableSub = (c: InteractableSubcategory) => {
    setInteractableSubFilter((prev) => {
      const next = { ...prev, [c]: !prev[c] }
      persist({ interactableSub: next })
      return next
    })
  }
  const setAllInteractableSub = (value: boolean) => {
    const next = Object.fromEntries(
      INTERACTABLE_SUBCATEGORY_ORDER.map((c) => [c, value]),
    ) as Record<InteractableSubcategory, boolean>
    setInteractableSubFilter(next)
    persist({ interactableSub: next })
  }
  const setModeAndPersist = (m: BrowseMode) => {
    setMode(m)
    persist({ mode: m })
  }
  const setShowCampaignAndPersist = (v: boolean) => {
    setShowCampaign(v)
    persist({ showCampaign: v })
  }
  const setShowCustomAndPersist = (v: boolean) => {
    setShowCustom(v)
    persist({ showCustom: v })
  }
  const setShowNoTemplateAndPersist = (v: boolean) => {
    setShowNoTemplate(v)
    persist({ showNoTemplate: v })
  }

  const entries = useMemo(() => {
    const all = catalog?.mapObjects ?? []
    const q = query.trim().toLowerCase()
    const selectedBiomes = BIOME_ORDER.filter((b) => biomeFilter[b])
    const wantedBiomes = selectedBiomes.length < BIOME_ORDER.length
      ? selectedBiomes.map((b) => BIOME_ID_TO_CATALOG_BIOME[b])
      : null
    // Decorations/Interactables (independently toggled) and the single-select
    // Animals/F/X/Spawners/Resources group combine into one active-category
    // set — any restriction from either narrows the list the same way the
    // old single typeFilter Set used to.
    const activeCategories = new Set<TypeFilterKey>(typeFilter)
    if (plainTypeFilter) activeCategories.add(plainTypeFilter)
    return all.filter((o: CatalogMapObject) => {
      // Spawners is a single-select pill (see togglePlainType) — deselecting
      // it lands back on "no filter", which the activeCategories check below
      // treats as "show everything". Opt out explicitly here so Spawners
      // behaves like a real toggle instead of being stuck always-visible.
      if (o.category === 'spawns' && plainTypeFilter !== 'spawns') return false
      if (activeCategories.size > 0 && !activeCategories.has(o.category as TypeFilterKey)) return false
      if (wantedBiomes && (!o.biome || !wantedBiomes.includes(o.biome))) return false
      // Safe cast: resolveDecorationSubcategory only ever returns 'animals'/
      // 'fx' when the real category is 'animals'/'fxs', which can't be true
      // here since this branch is guarded on category === 'environments'.
      if (o.category === 'environments'
        && !decorationSubFilter[resolveDecorationSubcategory(o.id, o.category) as PanelDecorationSubcategory]) return false
      if (o.category === 'interactables' && !interactableSubFilter[resolveInteractableSubcategory(o.id)]) return false
      if (!showCampaign && o.id.includes('campaign')) return false
      if (!showCustom && o.id.includes('custom')) return false
      if (q && !o.name.toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalog, typeFilter, plainTypeFilter, biomeFilter, decorationSubFilter, interactableSubFilter, showCampaign, showCustom, query])

  const creatureEntries = useMemo(() => {
    const all = catalog?.creatures ?? []
    const q = query.trim().toLowerCase()
    const selectedTiers = TIER_ORDER.filter((t) => tierFilter[t])
    const tierRestricted = selectedTiers.length < TIER_ORDER.length
    return all.filter((c) => {
      if (fractionFilter.size > 0 && !fractionFilter.has(c.fraction)) return false
      if (tierRestricted && !selectedTiers.includes(c.tier)) return false
      if (!showCampaign && c.id.includes('campaign')) return false
      if (!showCustom && c.id.includes('custom')) return false
      if (!showNoTemplate && !templateForCreature(catalog, c)) return false

      return !(q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q));
    })
  }, [catalog, fractionFilter, tierFilter, showCampaign, showCustom, showNoTemplate, query])

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
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Browser settings">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3" data-nodrag>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="obj-browser-show-campaign" className="text-xs cursor-pointer">
                  Show campaign objects
                </Label>
                <Switch
                  id="obj-browser-show-campaign"
                  checked={showCampaign}
                  onCheckedChange={setShowCampaignAndPersist}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="obj-browser-show-custom" className="text-xs cursor-pointer">
                  Show custom objects
                </Label>
                <Switch
                  id="obj-browser-show-custom"
                  checked={showCustom}
                  onCheckedChange={setShowCustomAndPersist}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="obj-browser-show-custom" className="text-xs cursor-pointer">
                    Show objects without placeable template
                </Label>
                <Switch
                    id="obj-browser-show-custom"
                    checked={showNoTemplate}
                    onCheckedChange={setShowNoTemplateAndPersist}
                />
              </div>
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Close" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="px-3 pt-2 pb-1.5 space-y-1.5 shrink-0 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {mode === 'objects' ? (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={pillClass(BIOME_ORDER.some((b) => !biomeFilter[b]), 'px-2 rounded flex items-center gap-0.5')}>
                      Biomes
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-48 space-y-2" data-nodrag>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="obj-browser-biome-all"
                        checked={BIOME_ORDER.every((b) => biomeFilter[b])}
                        onCheckedChange={(v) => setAllBiomes(Boolean(v))}
                      />
                      <Label htmlFor="obj-browser-biome-all" className="text-xs cursor-pointer font-medium">All</Label>
                    </div>
                    <div className="border-t border-border pt-2 space-y-2">
                      {BIOME_ORDER.map((b) => (
                        <div key={b} className="flex items-center gap-2">
                          <Checkbox
                            id={`obj-browser-biome-${b}`}
                            checked={biomeFilter[b]}
                            onCheckedChange={() => toggleBiome(b)}
                          />
                          <Label htmlFor={`obj-browser-biome-${b}`} className="text-xs cursor-pointer">{BIOME_NAMES[b]}</Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="flex items-stretch">
                  <button
                    onClick={() => toggleType('environments')}
                    className={pillClass(typeFilter.has('environments'), 'px-2 rounded-l rounded-r-none border-r-0')}
                  >
                    {TYPE_FILTER_LABELS.environments}
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={pillClass(typeFilter.has('environments'), 'w-5 rounded-r flex items-center justify-center')}
                        title="Decorations sub-categories"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 space-y-2" data-nodrag>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sub-categories</p>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="obj-browser-decoration-subcat-all"
                          checked={PANEL_DECORATION_SUBCATEGORY_ORDER.every((c) => decorationSubFilter[c])}
                          onCheckedChange={(v) => setAllDecorationSub(Boolean(v))}
                        />
                        <Label htmlFor="obj-browser-decoration-subcat-all" className="text-xs cursor-pointer font-medium">All</Label>
                      </div>
                      <div className="border-t border-border pt-2 space-y-2">
                        {PANEL_DECORATION_SUBCATEGORY_ORDER.map((c) => (
                          <div key={c} className="flex items-center gap-2">
                            <Checkbox
                              id={`obj-browser-decoration-subcat-${c}`}
                              checked={decorationSubFilter[c]}
                              onCheckedChange={() => toggleDecorationSub(c)}
                            />
                            <Label htmlFor={`obj-browser-decoration-subcat-${c}`} className="text-xs cursor-pointer">
                              {DECORATION_SUBCATEGORY_LABELS[c]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-stretch">
                  <button
                    onClick={() => toggleType('interactables')}
                    className={pillClass(typeFilter.has('interactables'), 'px-2 rounded-l rounded-r-none border-r-0')}
                  >
                    {TYPE_FILTER_LABELS.interactables}
                  </button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className={pillClass(typeFilter.has('interactables'), 'w-5 rounded-r flex items-center justify-center')}
                        title="Interactables sub-categories"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-56 space-y-2" data-nodrag>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sub-categories</p>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="obj-browser-interactable-subcat-all"
                          checked={INTERACTABLE_SUBCATEGORY_ORDER.every((c) => interactableSubFilter[c])}
                          onCheckedChange={(v) => setAllInteractableSub(Boolean(v))}
                        />
                        <Label htmlFor="obj-browser-interactable-subcat-all" className="text-xs cursor-pointer font-medium">All</Label>
                      </div>
                      <div className="border-t border-border pt-2 space-y-2">
                        {INTERACTABLE_SUBCATEGORY_ORDER.map((c) => (
                          <div key={c} className="flex items-center gap-2">
                            <Checkbox
                              id={`obj-browser-interactable-subcat-${c}`}
                              checked={interactableSubFilter[c]}
                              onCheckedChange={() => toggleInteractableSub(c)}
                            />
                            <Label htmlFor={`obj-browser-interactable-subcat-${c}`} className="text-xs cursor-pointer">
                              {INTERACTABLE_SUBCATEGORY_LABELS[c]}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            ) : (
              <>
                {(catalog?.factions ?? []).map((f) => (
                  <FilterPill key={f.id} active={fractionFilter.has(f.id)} onClick={() => toggleFraction(f.id)}>
                    {f.name}
                  </FilterPill>
                )).concat(
                  <FilterPill key={NEUTRAL_FRACTION_ID} active={fractionFilter.has(NEUTRAL_FRACTION_ID)} onClick={() => toggleFraction(NEUTRAL_FRACTION_ID)}>
                    Neutral
                  </FilterPill>,
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <button className={pillClass(TIER_ORDER.some((t) => !tierFilter[t]), 'px-2 rounded flex items-center gap-0.5')}>
                      Tier
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-40 space-y-2" data-nodrag>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="obj-browser-tier-all"
                        checked={TIER_ORDER.every((t) => tierFilter[t])}
                        onCheckedChange={(v) => setAllTiers(Boolean(v))}
                      />
                      <Label htmlFor="obj-browser-tier-all" className="text-xs cursor-pointer font-medium">All</Label>
                    </div>
                    <div className="border-t border-border pt-2 space-y-2">
                      {TIER_ORDER.map((t) => (
                        <div key={t} className="flex items-center gap-2">
                          <Checkbox
                            id={`obj-browser-tier-${t}`}
                            checked={tierFilter[t]}
                            onCheckedChange={() => toggleTier(t)}
                          />
                          <Label htmlFor={`obj-browser-tier-${t}`} className="text-xs cursor-pointer">Tier {t}</Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
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
            {PLAIN_TYPE_FILTER_ORDER.map((t) => (
              <FilterPill key={t} active={plainTypeFilter === t} onClick={() => togglePlainType(t)}>
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
