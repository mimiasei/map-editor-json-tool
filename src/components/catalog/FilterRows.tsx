// ─── Filter switch rows ───────────────────────────────────────────────────────
// A "Show all" toggle over a list of individually toggleable keys. Lifted out of
// GameDatabaseFilter so the portrait browser's filter uses the same control rather than
// a second copy of the same switch markup.

import { Switch } from '@/components/ui/switch'
import { useTranslation } from 'react-i18next'

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
 * Does this group admit `key`? `showAll` is kept equal to "every switch is on" (see FilterRows and
 * mergeFilterGroup), so it only short-circuits the common case.
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
  const enabled = { ...defaults.enabled, ...(saved.enabled ?? {}) }
  // Show all used to hide the other switches; it is now just their master switch, so derive it from them.
  return { showAll: Object.values(enabled).every(Boolean), enabled }
}

interface Props {
  label: string
  group: FilterGroup
  keys: string[]
  labelFor: (k: string) => string
  onChange: (g: FilterGroup) => void
}

export default function FilterRows({ label, group, keys, labelFor, onChange }: Props) {
  const { t } = useTranslation()
  const isOn = (enabled: Record<string, boolean>, k: string) => enabled[k] ?? true
  const allOn = keys.every((k) => isOn(group.enabled, k))
  // Show all switches every key on or off at once; `showAll` stays true exactly when every key is on.
  const toggleShowAll = () => {
    const next = !allOn
    onChange({ showAll: next, enabled: { ...group.enabled, ...Object.fromEntries(keys.map((k) => [k, next])) } })
  }
  const toggleKey = (k: string) => {
    const enabled = { ...group.enabled, [k]: !isOn(group.enabled, k) }
    onChange({ showAll: keys.every((key) => isOn(enabled, key)), enabled })
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{t('catalog.filterRows.showAll')}</span>
        <Switch checked={allOn} onCheckedChange={toggleShowAll} />
      </div>
      {keys.map((k) => (
        <div key={k} className="flex items-center justify-between gap-2">
          <span className="text-xs">{labelFor(k)}</span>
          <Switch checked={isOn(group.enabled, k)} onCheckedChange={() => toggleKey(k)} />
        </div>
      ))}
    </div>
  )
}
