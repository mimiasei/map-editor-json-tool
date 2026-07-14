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

// ─── Filter state ─────────────────────────────────────────────────────────────

export type MapObjectCategory = CatalogMapObject['category']

export interface MapObjectFilterState {
  interactableOnly: boolean
  categories: Record<MapObjectCategory, boolean>
}

export const DEFAULT_FILTER: MapObjectFilterState = {
  interactableOnly: false,
  categories: {
    interactables: true,
    resources: true,
    environments: true,
    spawns: true,
  },
}

const STORAGE_KEY = 'oe-map-object-filter'

export function loadSavedFilter(): MapObjectFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_FILTER, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_FILTER
}

function saveFilter(f: MapObjectFilterState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(f)) } catch { /* ignore */ }
}

// ─── Category labels ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<MapObjectCategory, string> = {
  interactables: 'Interactables',
  resources: 'Resources',
  environments: 'Environments',
  spawns: 'Spawns',
}

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
          <DialogTitle className="text-sm">Filter Map Objects</DialogTitle>
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
              Interactable only
            </Label>
          </div>

          <Separator />

          {/* Category toggles */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Categories
            </p>
            {(Object.keys(CATEGORY_LABELS) as MapObjectCategory[]).map((cat) => (
              <div key={cat} className="flex items-center gap-2">
                <Checkbox
                  id={`filter-cat-${cat}`}
                  checked={draft.categories[cat]}
                  onCheckedChange={() => toggleCategory(cat)}
                />
                <Label htmlFor={`filter-cat-${cat}`} className="cursor-pointer">
                  {CATEGORY_LABELS[cat]}
                </Label>
              </div>
            ))}
          </div>

          {/* Result count */}
          <p className="text-xs text-muted-foreground">
            Showing approximately {filteredCount} of {totalCount} objects
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button size="sm" onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
