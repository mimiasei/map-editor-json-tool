// ─── Filter switch rows ───────────────────────────────────────────────────────
// A "Show all" toggle over a list of individually toggleable keys. Lifted out of
// GameDatabaseFilter so the portrait browser's filter uses the same control rather than
// a second copy of the same switch markup.

import { Switch } from '@/components/ui/switch'

export interface FilterGroup {
  showAll: boolean
  enabled: Record<string, boolean>
}

/** Build a group with every key enabled — the default "nothing filtered out" state. */
export function makeFilterGroup(keys: (string | number)[]): FilterGroup {
  const enabled: Record<string, boolean> = {}
  for (const k of keys) enabled[String(k)] = true
  return { showAll: true, enabled }
}

/** True when the group narrows anything, i.e. worth showing the active-filter dot. */
export function isGroupActive(group: FilterGroup): boolean {
  return !group.showAll || Object.values(group.enabled).some((v) => !v)
}

/**
 * Does this group admit `key`? `showAll` short-circuits, so the per-key switches keep
 * their last state while disabled and come back when Show all is turned off.
 */
export function groupAdmits(group: FilterGroup, key: string): boolean {
  if (group.showAll) return true
  return group.enabled[key] ?? true
}

/**
 * Merge persisted state over defaults. Default keys survive, so adding a new faction or
 * kind does not need a storage migration.
 */
export function mergeFilterGroup(
  defaults: FilterGroup,
  saved: Partial<FilterGroup> | undefined,
): FilterGroup {
  if (!saved) return defaults
  return {
    showAll: saved.showAll ?? defaults.showAll,
    enabled: { ...defaults.enabled, ...(saved.enabled ?? {}) },
  }
}

interface Props {
  label: string
  group: FilterGroup
  keys: string[]
  labelFor: (k: string) => string
  onChange: (g: FilterGroup) => void
}

export default function FilterRows({ label, group, keys, labelFor, onChange }: Props) {
  const toggleShowAll = () => onChange({ ...group, showAll: !group.showAll })
  const toggleKey = (k: string) =>
    onChange({ ...group, enabled: { ...group.enabled, [k]: !group.enabled[k] } })

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">Show all</span>
        <Switch checked={group.showAll} onCheckedChange={toggleShowAll} />
      </div>
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
