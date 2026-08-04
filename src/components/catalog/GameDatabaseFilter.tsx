// ─── Game Database Filter popover ────────────────────────────────────────────
// Provides per-tab filter controls (faction, tier, slot, rarity, school,
// map category) as a live-update Popover. No Apply button — changes are
// immediately reflected. State is persisted to localStorage.

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal } from 'lucide-react'
import type { CatalogCreature, CatalogArtifact, CatalogSpell } from '@/lib/catalog/types'
import { FACTION_ORDER } from '@/lib/factions'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TabId = 'heroes' | 'creatures' | 'artifacts' | 'spells' | 'skills' | 'mapObjects'

interface FilterGroup {
  showAll: boolean
  enabled: Record<string, boolean>
}

export interface GameDatabaseFilterState {
  factions:      FilterGroup
  tiers:         FilterGroup
  slots:         FilterGroup
  rarities:      FilterGroup
  schools:       FilterGroup
  mapCategories: FilterGroup
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'oe-game-database-filter'

// Shared with the hero picker and the Game Database grouping.
const FACTIONS      = FACTION_ORDER
const CREATURE_TIERS = [1, 2, 3, 4, 5, 6, 7]
const SCHOOLS       = ['Arcane', 'Daylight', 'Neutral', 'Nightshade', 'Primal']
const MAP_CATEGORIES = ['interactables', 'resources', 'environments', 'spawns']
const MAP_CATEGORY_LABELS: Record<string, string> = {
  interactables: 'Interactables',
  resources:     'Resources',
  environments:  'Environments',
  spawns:        'Spawns',
}

function makeGroup(keys: (string | number)[]): FilterGroup {
  const enabled: Record<string, boolean> = {}
  for (const k of keys) enabled[String(k)] = true
  return { showAll: true, enabled }
}

export const DEFAULT_FILTER: GameDatabaseFilterState = {
  factions:      makeGroup(FACTIONS),
  tiers:         makeGroup(CREATURE_TIERS),
  slots:         makeGroup([]),  // populated dynamically; default showAll=true covers all
  rarities:      makeGroup([]),
  schools:       makeGroup(SCHOOLS),
  mapCategories: makeGroup(MAP_CATEGORIES),
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function mergeGroup(defaults: FilterGroup, saved: Partial<FilterGroup> | undefined): FilterGroup {
  if (!saved) return defaults
  return {
    showAll: saved.showAll ?? defaults.showAll,
    // Deep-merge enabled: default keys are preserved; saved values override them
    enabled: { ...defaults.enabled, ...(saved.enabled ?? {}) },
  }
}

export function loadSavedFilter(): GameDatabaseFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<GameDatabaseFilterState>
      return {
        factions:      mergeGroup(DEFAULT_FILTER.factions,      parsed.factions),
        tiers:         mergeGroup(DEFAULT_FILTER.tiers,         parsed.tiers),
        slots:         mergeGroup(DEFAULT_FILTER.slots,         parsed.slots),
        rarities:      mergeGroup(DEFAULT_FILTER.rarities,      parsed.rarities),
        schools:       mergeGroup(DEFAULT_FILTER.schools,       parsed.schools),
        mapCategories: mergeGroup(DEFAULT_FILTER.mapCategories, parsed.mapCategories),
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

  const check = (group: FilterGroup) =>
    !group.showAll || Object.values(group.enabled).some((v) => !v)

  if (tab === 'heroes')      return check(state.factions)
  if (tab === 'creatures')   return check(state.factions) || check(state.tiers)
  if (tab === 'artifacts')   return check(state.slots) || check(state.rarities)
  if (tab === 'spells')      return check(state.schools)
  if (tab === 'mapObjects')  return check(state.mapCategories)
  return false
}

// ─── Catalog catalog shape (minimal) ──────────────────────────────────────────

interface CatalogShape {
  artifacts: CatalogArtifact[]
  creatures:  CatalogCreature[]
  spells:     CatalogSpell[]
}

// ─── Sub-component: FilterGroup UI ───────────────────────────────────────────

function FilterGroupUI({
  label,
  group,
  keys,
  labelFor,
  onChange,
}: {
  label:     string
  group:     FilterGroup
  keys:      string[]
  labelFor:  (k: string) => string
  onChange:  (g: FilterGroup) => void
}) {
  const toggleShowAll = () => {
    onChange({ ...group, showAll: !group.showAll })
  }
  const toggleKey = (k: string) => {
    onChange({
      ...group,
      enabled: { ...group.enabled, [k]: !group.enabled[k] },
    })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {/* Show All row */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">Show all</span>
        <Switch checked={group.showAll} onCheckedChange={toggleShowAll} />
      </div>
      {/* Individual rows */}
      {keys.map((k) => (
        <div
          key={k}
          className={`flex items-center justify-between gap-2 transition-opacity ${group.showAll ? 'opacity-40' : ''}`}
        >
          <span className="text-xs">{labelFor(k)}</span>
          <Switch
            checked={group.enabled[k] ?? true}
            onCheckedChange={() => toggleKey(k)}
            disabled={group.showAll}
          />
        </div>
      ))}
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
          title="Filter items"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {isFilterActive(value, activeTab) && (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-3 space-y-4 text-sm" align="end">
        {/* ── Heroes ── */}
        {activeTab === 'heroes' && (
          <FilterGroupUI
            label="Faction"
            group={value.factions}
            keys={FACTIONS}
            labelFor={(k) => k}
            onChange={update('factions')}
          />
        )}

        {/* ── Creatures ── */}
        {activeTab === 'creatures' && (
          <>
            <FilterGroupUI
              label="Faction"
              group={value.factions}
              keys={FACTIONS}
              labelFor={(k) => k}
              onChange={update('factions')}
            />
            <FilterGroupUI
              label="Tier"
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
            <FilterGroupUI
              label="Slot"
              group={value.slots}
              keys={artifactSlots}
              labelFor={(k) => k}
              onChange={update('slots')}
            />
            <FilterGroupUI
              label="Rarity"
              group={value.rarities}
              keys={artifactRarities}
              labelFor={(k) => k}
              onChange={update('rarities')}
            />
          </>
        )}

        {/* ── Spells ── */}
        {activeTab === 'spells' && (
          <FilterGroupUI
            label="School"
            group={value.schools}
            keys={SCHOOLS}
            labelFor={(k) => k}
            onChange={update('schools')}
          />
        )}

        {/* ── Map Objects ── */}
        {activeTab === 'mapObjects' && (
          <FilterGroupUI
            label="Category"
            group={value.mapCategories}
            keys={MAP_CATEGORIES}
            labelFor={(k) => MAP_CATEGORY_LABELS[k] ?? k}
            onChange={update('mapCategories')}
          />
        )}

        <div className="pt-1 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={handleReset}>
            Reset filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
