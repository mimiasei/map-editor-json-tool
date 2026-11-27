// ─── Map Object Filter dialog ─────────────────────────────────────────────────
// Lets users narrow map object dropdowns by category and interactability.
// Filter state is persisted to localStorage.

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { useState, useEffect } from 'react'
import type { CatalogMapObject } from '@/lib/catalog/types'
import { useTranslation } from 'react-i18next'
import { interactableGroupOf } from '@/lib/map-grid/interactable-subcategories'

// ─── Filter state ─────────────────────────────────────────────────────────────

export type MapObjectCategory = CatalogMapObject['category']
export type MapObjectGroup = 'creatureBanks' | 'heroBoosts'
const GROUPS: MapObjectGroup[] = ['creatureBanks', 'heroBoosts']

/** Does this object pass the groups switches: no switch on, or it belongs to a group that is on. */
export function passesGroupFilter(sid: string, onlyGroups: Record<MapObjectGroup, boolean>): boolean {
  if (!GROUPS.some((g) => onlyGroups[g])) return true
  const group = interactableGroupOf(sid)
  return group !== null && onlyGroups[group]
}

export interface MapObjectFilterState {
  interactableOnly: boolean
  /** When any is on, only objects of the groups that are on are listed. */
  onlyGroups: Record<MapObjectGroup, boolean>
  categories: Record<MapObjectCategory, boolean>
}

export const DEFAULT_FILTER: MapObjectFilterState = {
  interactableOnly: false,
  onlyGroups: { creatureBanks: false, heroBoosts: false },
  categories: {
    interactables: true,
    resources: true,
    environments: true,
    spawns: true,
    animals: true,
    fxs: true,
    artifacts: true,
    blocks: true,
    // "test" is the game's internal debug/dev object bucket (tag: "TEST") —
    // hidden by default so it doesn't clutter pickers; still toggleable here.
    test: false,
  },
}

const STORAGE_KEY = 'oe-map-object-filter'

export function loadSavedFilter(): MapObjectFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MapObjectFilterState>
      return { ...DEFAULT_FILTER, ...saved, onlyGroups: { ...DEFAULT_FILTER.onlyGroups, ...saved.onlyGroups } }
    }
  } catch { /* ignore */ }
  return DEFAULT_FILTER
}

function saveFilter(f: MapObjectFilterState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORIES: MapObjectCategory[] = ['interactables', 'resources', 'environments', 'spawns', 'animals', 'fxs', 'artifacts', 'blocks', 'test']

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  filter: MapObjectFilterState
  onApply: (filter: MapObjectFilterState) => void
  totalCount: number
  filteredCount: number
}

export default function MapObjectFilter({
  open,
  onOpenChange,
  filter,
  onApply,
  totalCount,
  filteredCount,
}: Props) {
  // Local draft state — only committed on Apply
  const { t } = useTranslation()
  const [draft, setDraft] = useState<MapObjectFilterState>(filter)

  useEffect(() => {
    if (open) setDraft(filter)
  }, [open, filter])

  const handleApply = () => {
    saveFilter(draft)
    onApply(draft)
    onOpenChange(false)
  }

  const handleReset = () => {
    setDraft(DEFAULT_FILTER)
  }

  const toggleCategory = (cat: MapObjectCategory) => {
    setDraft((prev) => ({
      ...prev,
      categories: { ...prev.categories, [cat]: !prev.categories[cat] },
    }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('catalog.mapObjectFilter.filterMapObjects')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Interactable only */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="filter-interactable"
              checked={draft.interactableOnly}
              onCheckedChange={(v) => setDraft((prev) => ({ ...prev, interactableOnly: Boolean(v) }))}
            />
            <Label htmlFor="filter-interactable" className="cursor-pointer">
              {t('catalog.mapObjectFilter.interactableOnly')}
            </Label>
          </div>

          {/* Groups of interactables */}
          {GROUPS.map((group) => (
            <div key={group} className="flex items-center gap-2">
              <Checkbox
                id={`filter-group-${group}`}
                checked={draft.onlyGroups[group]}
                onCheckedChange={(v) => setDraft((prev) => ({ ...prev, onlyGroups: { ...prev.onlyGroups, [group]: Boolean(v) } }))}
              />
              <Label htmlFor={`filter-group-${group}`} className="cursor-pointer">
                {t(`catalog.mapObjectFilter.only.${group}`)}
              </Label>
            </div>
          ))}

          <Separator />

          {/* Category toggles */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t('catalog.mapObjectFilter.categories')}
            </p>
            {CATEGORIES.map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <Checkbox
                  id={`filter-cat-${cat}`}
                  checked={draft.categories[cat]}
                  onCheckedChange={() => toggleCategory(cat)}
                />
                <Label htmlFor={`filter-cat-${cat}`} className="cursor-pointer">
                  {t(`catalog.mapCategories.${cat}`)}
                </Label>
              </div>
            ))}
          </div>

          {/* Result count */}
          <p className="text-xs text-muted-foreground">
            {t('catalog.mapObjectFilter.showingApproximatelyOfObjects', { filteredCount, totalCount })}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            {t('shared.reset')}
          </Button>
          <Button size="sm" onClick={handleApply}>
            {t('mapGrid.objectActionsEditor.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
