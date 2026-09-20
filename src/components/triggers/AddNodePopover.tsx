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

interface Item {
  type: string
  label: string
  description: string
}

interface Group {
  label: string
  icon: LucideIcon
  items: Item[]
}

interface Props {
  kind: 'condition' | 'action'
  onPick: (type: string) => void
  children: ReactNode
}

function toItem(def: { type: string; label: string; description: string }): Item {
  return { type: def.type, label: def.label, description: def.description }
}

export default function AddNodePopover({ kind, onPick, children }: Props) {
  const [open, setOpen] = useState(false)

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

  const handlePick = (type: string) => {
    recordRecentType(kind, type)
    onPick(type)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${kind}s…`} />
          <CommandList className="max-h-80">
            <CommandEmpty>No matches.</CommandEmpty>
            {recent.length > 0 && (
              <CommandGroup heading="Recently used">
                {recent.map((item) => (
                  <CommandItem
                    key={`recent-${item.type}`}
                    value={`recent ${item.label} ${item.type}`}
                    onSelect={() => handlePick(item.type)}
                  >
                    {item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {groups.map(
              (group) =>
                group.items.length > 0 && (
                  <CommandGroup key={group.label} heading={`${group.label} (${group.items.length})`}>
                    {group.items.map((item) => (
                      <CommandItem
                        key={item.type}
                        value={`${group.label} ${item.label} ${item.type} ${item.description}`}
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
                ),
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
