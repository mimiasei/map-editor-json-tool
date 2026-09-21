import { useMemo, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { CONDITION_LIST } from '@/schema/conditions'
import { ACTION_LIST, ACTION_CATEGORIES } from '@/schema/actions'
import {
  CONDITION_UI_CATEGORIES,
  getActionCategoryIcon,
  getRecentTypes,
  recordRecentType,
  HIDDEN_CONDITION_TYPES,
  HIDDEN_ACTION_TYPES,
} from '@/lib/trigger-visual'
import { SUBJECT_DEFS, type SubjectKey } from '@/lib/trigger-subjects'

interface Item {
  type: string
  label: string
  description: string
  /** Set only for "This <subject>" suggested items — see subjectKey above. */
  paramIndex?: number
}

interface Group {
  label: string
  icon: LucideIcon
  items: Item[]
}

interface Props {
  kind: 'condition' | 'action'
  onPick: (type: string, prefillParamIndex?: number) => void
  children: ReactNode
  /** Subject-first trigger creation — shows a "This <subject>" group of
   *  verbs relevant to the seeded object above everything else. The picked
   *  verb's seeded-entity param index is reported back via onPick so the
   *  caller (which already knows the entitySid) can pre-fill it. */
  subjectKey?: SubjectKey
}

function toItem(def: { type: string; label: string; description: string }): Item {
  return { type: def.type, label: def.label, description: def.description }
}

// Deliberately a plain includes() filter, not cmdk's default fuzzy scorer —
// with only ~50-100 short, fixed items, fuzzy/typo-tolerant matching bought
// little and made "why is X above Y" opaque. Title beats sid beats
// description, and description is a fallback tier only: it's searched at
// all only when nothing matches by title or sid anywhere in the list, so a
// word buried in one item's description never crowds out an exact title
// match sitting elsewhere in the list.
type MatchTier = 0 | 1 | 2 | 3
function matchTier(item: Item, q: string): MatchTier {
  if (item.label.toLowerCase().includes(q)) return 1
  if (item.type.toLowerCase().includes(q)) return 2
  if (item.description.toLowerCase().includes(q)) return 3
  return 0
}

export default function AddNodePopover({ kind, onPick, children, subjectKey }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const groups = useMemo<Group[]>(() => {
    if (kind === 'condition') {
      return CONDITION_UI_CATEGORIES.map((cat) => ({
        label: cat.label,
        icon: cat.icon,
        items: CONDITION_LIST.filter((c) => cat.types.includes(c.type) && !HIDDEN_CONDITION_TYPES.has(c.type)).map(toItem),
      }))
    }
    return ACTION_CATEGORIES.map((cat) => ({
      label: cat,
      icon: getActionCategoryIcon(cat),
      items: ACTION_LIST.filter((a) => a.category === cat && !HIDDEN_ACTION_TYPES.has(a.type)).map(toItem),
    }))
  }, [kind])

  const recent = useMemo<Item[]>(() => {
    if (!open) return []
    const all = kind === 'condition' ? CONDITION_LIST : ACTION_LIST
    const hidden = kind === 'condition' ? HIDDEN_CONDITION_TYPES : HIDDEN_ACTION_TYPES
    return getRecentTypes(kind)
      .map((type) => all.find((d) => d.type === type))
      .filter((d): d is (typeof all)[number] => !!d && !hidden.has(d.type))
      .map(toItem)
  }, [kind, open])

  const suggested = useMemo<Item[]>(() => {
    if (!subjectKey) return []
    const all = kind === 'condition' ? CONDITION_LIST : ACTION_LIST
    return SUBJECT_DEFS[subjectKey].verbs
      .filter((v) => v.kind === kind)
      .map((v): Item | null => {
        const def = all.find((d) => d.type === v.type)
        return def ? { ...toItem(def), paramIndex: v.paramIndex } : null
      })
      .filter((item): item is Item => !!item)
  }, [kind, subjectKey])

  const handlePick = (type: string, prefillParamIndex?: number) => {
    recordRecentType(kind, type)
    onPick(type, prefillParamIndex)
    setOpen(false)
  }

  const q = query.trim().toLowerCase()
  // The fallback-to-description tier is a list-wide decision, not a
  // per-item one — description matches only ever show up when literally
  // nothing in the whole picker (any group, recent, or suggested) matched
  // by title or sid first.
  const bestTier = useMemo<MatchTier>(() => {
    if (!q) return 0
    const all = [...suggested, ...recent, ...groups.flatMap((g) => g.items)]
    let best: MatchTier = 0
    for (const item of all) {
      const t = matchTier(item, q)
      if (t !== 0 && (best === 0 || t < best)) best = t
      if (best === 1) break
    }
    return best
  }, [q, suggested, recent, groups])

  const keepAndSort = (items: Item[]): Item[] => {
    if (!q) return items
    return items
      .filter((item) => matchTier(item, q) === bestTier)
      .sort((a, b) => matchTier(a, q) - matchTier(b, q))
  }

  const shownSuggested = keepAndSort(suggested)
  const shownRecent = keepAndSort(recent)
  const shownGroups = groups.map((g) => ({ ...g, items: keepAndSort(g.items) })).filter((g) => g.items.length > 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={`Search ${kind}s…`} value={query} onValueChange={setQuery} />
          <CommandList className="max-h-80">
            <CommandEmpty>No matches.</CommandEmpty>
            {shownSuggested.length > 0 && subjectKey && (
              <CommandGroup heading={SUBJECT_DEFS[subjectKey].label}>
                {shownSuggested.map((item) => (
                  <CommandItem
                    key={`suggested-${item.type}`}
                    value={`suggested-${item.type}`}
                    onSelect={() => handlePick(item.type, item.paramIndex)}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {shownRecent.length > 0 && (
              <CommandGroup heading="Recently used">
                {shownRecent.map((item) => (
                  <CommandItem
                    key={`recent-${item.type}`}
                    value={`recent-${item.type}`}
                    onSelect={() => handlePick(item.type)}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {shownGroups.map((group) => (
              <CommandGroup key={group.label} heading={`${group.label} (${group.items.length})`}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.type}
                    value={item.type}
                    onSelect={() => handlePick(item.type)}
                  >
                    <group.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate">{item.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{item.description}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
