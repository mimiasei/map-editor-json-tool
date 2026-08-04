// ─── Portrait browser filter ──────────────────────────────────────────────────
// Faction and kind toggles for the portrait browser, using the same switch rows as the
// Game Database's filter (FilterRows).
//
// Kept on its own storage key rather than sharing `oe-game-database-filter`: that state is
// tab-scoped and also carries tiers, slots and schools, so sharing it would mean narrowing
// the Game Database silently narrowed the portrait browser too.

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { SlidersHorizontal } from 'lucide-react'
import { FACTION_ORDER } from '@/lib/factions'
import { PORTRAIT_KINDS, PORTRAIT_KIND_LABELS, type PortraitKind } from '@/lib/catalog/portraits'
import FilterRows, {
  type FilterGroup,
  makeFilterGroup,
  mergeFilterGroup,
  isGroupActive,
  groupAdmits,
} from './FilterRows'

const STORAGE_KEY = 'oe-hero-picker-filter'

export interface PortraitFilterState {
  factions: FilterGroup
  kinds: FilterGroup
}

export const DEFAULT_PORTRAIT_FILTER: PortraitFilterState = {
  factions: makeFilterGroup(FACTION_ORDER),
  kinds: makeFilterGroup(PORTRAIT_KINDS),
}

export function loadPortraitFilter(): PortraitFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PortraitFilterState>
      return {
        factions: mergeFilterGroup(DEFAULT_PORTRAIT_FILTER.factions, parsed.factions),
        kinds: mergeFilterGroup(DEFAULT_PORTRAIT_FILTER.kinds, parsed.kinds),
      }
    }
  } catch { /* unreadable or blocked storage — fall through to defaults */ }
  return DEFAULT_PORTRAIT_FILTER
}

function save(state: PortraitFilterState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

export function isPortraitFilterActive(state: PortraitFilterState): boolean {
  return isGroupActive(state.factions) || isGroupActive(state.kinds)
}

/** Faction is matched on the display name, so "Neutral" covers both `neutral` and unknown. */
export function portraitFilterAdmits(
  state: PortraitFilterState,
  factionDisplay: string,
  kind: PortraitKind,
): boolean {
  return groupAdmits(state.factions, factionDisplay) && groupAdmits(state.kinds, kind)
}

interface Props {
  value: PortraitFilterState
  onChange: (s: PortraitFilterState) => void
  /** Hidden in hero mode, where every entry is a hero of a playable faction. */
  showKinds?: boolean
}

export default function HeroPickerFilter({ value, onChange, showKinds = true }: Props) {
  const update = (key: keyof PortraitFilterState) => (g: FilterGroup) => {
    const next = { ...value, [key]: g }
    onChange(next)
    save(next)
  }

  const reset = () => {
    onChange(DEFAULT_PORTRAIT_FILTER)
    save(DEFAULT_PORTRAIT_FILTER)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-7 w-7 shrink-0"
          title="Filter portraits"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {isPortraitFilterActive(value) && (
            <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-3 space-y-4 text-sm" align="end">
        <FilterRows
          label="Faction"
          group={value.factions}
          keys={FACTION_ORDER}
          labelFor={(k) => k}
          onChange={update('factions')}
        />

        {showKinds && (
          <FilterRows
            label="Kind"
            group={value.kinds}
            keys={PORTRAIT_KINDS}
            labelFor={(k) => PORTRAIT_KIND_LABELS[k as PortraitKind] ?? k}
            onChange={update('kinds')}
          />
        )}

        <div className="pt-1 border-t border-border">
          <Button variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={reset}>
            Reset filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
