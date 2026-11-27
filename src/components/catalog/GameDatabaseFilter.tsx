// ─── Game Database Filter popover ────────────────────────────────────────────
// Provides per-tab filter controls (faction, tier, slot, rarity, school,
// map category) as a live-update Popover. No Apply button — changes are
// immediately reflected. State is persisted to localStorage.

import { useState } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal } from '@/components/ui/icons'
import type { CatalogCreature, CatalogArtifact, CatalogSpell } from '@/lib/catalog/types'
import { FACTION_ORDER } from '@/lib/factions'
import { DECORATION_SUBCATEGORY_ORDER, decorationSubcategoryName, type DecorationSubcategory } from '@/lib/map-grid/decoration-subcategories'
import { INTERACTABLE_SUBCATEGORY_ORDER, interactableSubcategoryName, type InteractableSubcategory } from '@/lib/map-grid/interactable-subcategories'
import { SIZE_ORDER } from '@/lib/map-grid/object-size'
import FilterRows, {
  type FilterGroup,
  makeFilterGroup,
  mergeFilterGroup,
  isGroupActive,
} from './FilterRows'
import { useTranslation } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TabId = 'heroes' | 'creatures' | 'artifacts' | 'spells' | 'skills' | 'mapObjects'

export interface GameDatabaseFilterState {
  factions:      FilterGroup
  tiers:         FilterGroup
  slots:         FilterGroup
  rarities:      FilterGroup
  schools:       FilterGroup
  mapCategories: FilterGroup
  mapBiomes:     FilterGroup
  /** Shown under the Decorations / Interactables switches while those are on; every key on is "all", turning keys off narrows the list. */
  mapDecorationSubs:   FilterGroup
  mapInteractableSubs: FilterGroup
  mapSizes:      FilterGroup
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'oe-game-database-filter'

// Shared with the hero picker and the Game Database grouping.
const FACTIONS      = FACTION_ORDER
const CREATURE_TIERS = [1, 2, 3, 4, 5, 6, 7]
const SCHOOLS       = ['Arcane', 'Daylight', 'Neutral', 'Nightshade', 'Primal']
// 'artifacts' deliberately excluded — those entries are excluded from the
// mapObjects tab entirely (see GameDatabaseDialog.tsx), shown under the
// Artifacts tab instead. Otherwise the full CatalogMapObject['category'] set.
// The CatalogMapObject['category'] set, with the debug `test` and `blocks` merged into 'miscellaneous'.
// 'campaign' and 'custom' are not categories: an object whose sid contains that word (campaign_x, x_custom) is governed by that switch alone,
// whatever its category ('campaign' wins when both words occur).
const MAP_CATEGORIES = ['interactables', 'resources', 'environments', 'spawns', 'animals', 'fxs', 'miscellaneous', 'campaign', 'custom']
type MapCategoryKey = 'interactables' | 'resources' | 'environments' | 'spawns' | 'animals' | 'fxs' | 'miscellaneous' | 'campaign' | 'custom'
// The sub-category lists of the Map Grid object browser: Decorations (minus its animals/fx entries, which are categories of their own here) and Interactables.
const DECORATION_SUBS: string[] = DECORATION_SUBCATEGORY_ORDER.filter((c) => c !== 'animals' && c !== 'fx')
const INTERACTABLE_SUBS: string[] = INTERACTABLE_SUBCATEGORY_ORDER
// The values of CatalogMapObject.biome (see its doc), plus objects that carry none.
const MAP_BIOMES = ['Grass', 'Desert', 'Deathland', 'Snow', 'Autumn', 'Lava', 'Dirt', 'none']

/** The filter key of a map object's category: test and blocks share 'miscellaneous'. */
export function mapCategoryKey(category: string): string {
  return category === 'test' || category === 'blocks' ? 'miscellaneous' : category
}

/** Does the sid contain `word` anywhere (campaign_x, x_campaign, customfoo)? Matched on the sid, not the display name. */
export function sidHasWord(sid: string, word: 'campaign' | 'custom'): boolean {
  return sid.toLowerCase().includes(word)
}

export const DEFAULT_FILTER: GameDatabaseFilterState = {
  factions:      makeFilterGroup(FACTIONS),
  tiers:         makeFilterGroup(CREATURE_TIERS),
  slots:         makeFilterGroup([]),  // populated dynamically; default showAll=true covers all
  rarities:      makeFilterGroup([]),
  schools:       makeFilterGroup(SCHOOLS),
  mapCategories: makeFilterGroup(MAP_CATEGORIES),
  mapBiomes:     makeFilterGroup(MAP_BIOMES),
  mapDecorationSubs:   makeFilterGroup(DECORATION_SUBS),
  mapInteractableSubs: makeFilterGroup(INTERACTABLE_SUBS),
  mapSizes:      makeFilterGroup([...SIZE_ORDER]),
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadSavedFilter(): GameDatabaseFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameDatabaseFilterState>
      // test and blocks became one 'miscellaneous' switch: off if either was off.
      const saved = parsed.mapCategories?.enabled
      // Creature banks and hero boosts were category switches for a moment; they are Interactables sub-categories now.
      if (saved) { delete saved.creatureBanks; delete saved.heroBoosts }
      if (saved && ('test' in saved || 'blocks' in saved) && !('miscellaneous' in saved)) {
        saved.miscellaneous = saved.test !== false && saved.blocks !== false
      }
      return {
        factions:      mergeFilterGroup(DEFAULT_FILTER.factions,      parsed.factions),
        tiers:         mergeFilterGroup(DEFAULT_FILTER.tiers,         parsed.tiers),
        slots:         mergeFilterGroup(DEFAULT_FILTER.slots,         parsed.slots),
        rarities:      mergeFilterGroup(DEFAULT_FILTER.rarities,      parsed.rarities),
        schools:       mergeFilterGroup(DEFAULT_FILTER.schools,       parsed.schools),
        mapCategories: mergeFilterGroup(DEFAULT_FILTER.mapCategories, parsed.mapCategories),
        mapBiomes:     mergeFilterGroup(DEFAULT_FILTER.mapBiomes,     parsed.mapBiomes),
        mapDecorationSubs:   mergeFilterGroup(DEFAULT_FILTER.mapDecorationSubs,   parsed.mapDecorationSubs),
        mapInteractableSubs: mergeFilterGroup(DEFAULT_FILTER.mapInteractableSubs, parsed.mapInteractableSubs),
        mapSizes:      mergeFilterGroup(DEFAULT_FILTER.mapSizes,      parsed.mapSizes),
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_FILTER
}

export function saveFilter(f: GameDatabaseFilterState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

// ─── Helper: is any filter active (non-default) ───────────────────────────────

export function isFilterActive(state: GameDatabaseFilterState, tab: TabId): boolean {
  if (tab === 'skills') return false

  const check = isGroupActive

  if (tab === 'heroes')      return check(state.factions)
  if (tab === 'creatures')   return check(state.factions) || check(state.tiers)
  if (tab === 'artifacts')   return check(state.slots) || check(state.rarities)
  if (tab === 'spells')      return check(state.schools)
  if (tab === 'mapObjects')  return check(state.mapCategories) || check(state.mapBiomes) || check(state.mapDecorationSubs) || check(state.mapInteractableSubs) || check(state.mapSizes)
  return false
}

// ─── Catalog catalog shape (minimal) ──────────────────────────────────────────

interface CatalogShape {
  artifacts: CatalogArtifact[]
  creatures:  CatalogCreature[]
  spells:     CatalogSpell[]
}

// ─── Map Objects tabs ─────────────────────────────────────────────────────────
// Vertical tabs like the map settings dialog: Category, then the sub-category lists of Interactables and Decorations (each hidden while its category
// switch is off), then Biome and Size. Every list works as in the Map Grid object browser: all on is everything, turning keys off narrows it.

type MapObjectTab = 'category' | 'interactables' | 'decorations' | 'biome' | 'size'

function MapObjectTabs({ value, update }: { value: GameDatabaseFilterState; update: (key: keyof GameDatabaseFilterState) => (g: FilterGroup) => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<MapObjectTab>('category')
  const tabs: MapObjectTab[] = [
    'category',
    ...(value.mapCategories.enabled.interactables !== false ? (['interactables'] as const) : []),
    ...(value.mapCategories.enabled.environments !== false ? (['decorations'] as const) : []),
    'biome',
    'size',
  ]
  // The tab being shown can disappear when its category is switched off.
  const shown = tabs.includes(tab) ? tab : 'category'
  const label = (id: MapObjectTab) => {
    switch (id) {
      case 'category': return t('catalog.gameDatabaseFilter.category')
      case 'interactables': return t('catalog.mapCategories.interactables')
      case 'decorations': return t('catalog.mapCategories.environments')
      case 'biome': return t('catalog.gameDatabaseFilter.biome')
      case 'size': return t('catalog.gameDatabaseFilter.size')
    }
  }
  return (
    <div className="flex h-[min(24rem,calc(100vh-14rem))] gap-3">
      <div role="tablist" aria-orientation="vertical" className="flex w-24 shrink-0 flex-col gap-1">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={shown === id}
            onClick={() => setTab(id)}
            className={cn(
              'rounded-md px-2 py-1.5 text-left text-xs transition-colors',
              shown === id ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {label(id)}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto pr-1">
        {shown === 'category' && (
          <FilterRows
            label={label('category')}
            group={value.mapCategories}
            keys={MAP_CATEGORIES}
            labelFor={(k) => t(`catalog.mapCategories.${k as MapCategoryKey}`)}
            onChange={update('mapCategories')}
          />
        )}
        {shown === 'interactables' && (
          <FilterRows
            label={label('interactables')}
            group={value.mapInteractableSubs}
            keys={INTERACTABLE_SUBS}
            labelFor={(k) => interactableSubcategoryName(k as InteractableSubcategory)}
            onChange={update('mapInteractableSubs')}
          />
        )}
        {shown === 'decorations' && (
          <FilterRows
            label={label('decorations')}
            group={value.mapDecorationSubs}
            keys={DECORATION_SUBS}
            labelFor={(k) => decorationSubcategoryName(k as DecorationSubcategory)}
            onChange={update('mapDecorationSubs')}
          />
        )}
        {shown === 'biome' && (
          <FilterRows
            label={label('biome')}
            group={value.mapBiomes}
            keys={MAP_BIOMES}
            labelFor={(k) => (k === 'none' ? t('catalog.gameDatabaseFilter.noBiome') : k)}
            onChange={update('mapBiomes')}
          />
        )}
        {shown === 'size' && (
          <FilterRows
            label={label('size')}
            group={value.mapSizes}
            keys={[...SIZE_ORDER]}
            labelFor={(k) => (k === 'other' ? t('mapGrid.objectBrowserPanel.sizeOther') : k)}
            onChange={update('mapSizes')}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  activeTab: TabId
  catalog:   CatalogShape
  value:     GameDatabaseFilterState
  onChange:  (s: GameDatabaseFilterState) => void
}

export default function GameDatabaseFilter({ activeTab, catalog, value, onChange }: Props) {
  const { t } = useTranslation()
  if (activeTab === 'skills') return null

  // Derive dynamic option lists from catalog
  const artifactSlots  = [...new Set(catalog.artifacts.map((a) => a.slot).filter(Boolean) as string[])].sort()
  const artifactRarities = [...new Set(catalog.artifacts.map((a) => a.rarity).filter(Boolean) as string[])].sort()

  const update = (key: keyof GameDatabaseFilterState) => (g: FilterGroup) => {
    const next = { ...value, [key]: g }
    onChange(next)
    saveFilter(next)
  }

  const handleReset = () => {
    const next: GameDatabaseFilterState = {
      ...DEFAULT_FILTER,
      // Keep dynamic slot/rarity lists but reset to showAll
      slots:    { showAll: true, enabled: Object.fromEntries(artifactSlots.map((s) => [s, true])) },
      rarities: { showAll: true, enabled: Object.fromEntries(artifactRarities.map((r) => [r, true])) },
    }
    onChange(next)
    saveFilter(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-7 w-7 shrink-0"
          title={t('catalog.gameDatabaseFilter.filterItems')}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {isFilterActive(value, activeTab) && (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className={`${activeTab === 'mapObjects' ? 'w-[26rem]' : 'w-56'} max-h-[80vh] overflow-y-auto p-3 space-y-4 text-sm`} align="end">
        {/* ── Heroes ── */}
        {activeTab === 'heroes' && (
          <FilterRows
            label={t('common.statsDialog.faction')}
            group={value.factions}
            keys={FACTIONS}
            labelFor={(k) => k}
            onChange={update('factions')}
          />
        )}

        {/* ── Creatures ── */}
        {activeTab === 'creatures' && (
          <>
            <FilterRows
              label={t('common.statsDialog.faction')}
              group={value.factions}
              keys={FACTIONS}
              labelFor={(k) => k}
              onChange={update('factions')}
            />
            <FilterRows
              label={t('common.spellBanDialog.tier')}
              group={value.tiers}
              keys={CREATURE_TIERS.map(String)}
              labelFor={(k) => `Tier ${k}`}
              onChange={update('tiers')}
            />
          </>
        )}

        {/* ── Artifacts ── */}
        {activeTab === 'artifacts' && (
          <>
            <FilterRows
              label={t('common.artifactBanDialog.slot')}
              group={value.slots}
              keys={artifactSlots}
              labelFor={(k) => k}
              onChange={update('slots')}
            />
            <FilterRows
              label={t('common.artifactBanDialog.rarity')}
              group={value.rarities}
              keys={artifactRarities}
              labelFor={(k) => k}
              onChange={update('rarities')}
            />
          </>
        )}

        {/* ── Spells ── */}
        {activeTab === 'spells' && (
          <FilterRows
            label={t('common.spellBanDialog.school')}
            group={value.schools}
            keys={SCHOOLS}
            labelFor={(k) => k}
            onChange={update('schools')}
          />
        )}

        {/* ── Map Objects: tabs, like the map settings ── */}
        {activeTab === 'mapObjects' && <MapObjectTabs value={value} update={update} />}

        <div className="pt-1 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={handleReset}>
            {t('shared.resetFilters')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
