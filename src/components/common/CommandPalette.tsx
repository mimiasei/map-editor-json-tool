import { useMemo } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Hash,
  Zap,
  ScrollText,
  CornerDownRight,
  GitBranch,
} from 'lucide-react'
import type { SelectionType } from '@/types/scenario'

interface PaletteItem {
  key: string
  group: string
  label: string
  subtitle?: string
  searchValue: string
  icon: React.ElementType
  type: SelectionType
  path: number[]
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { scenario, setSelection } = useScenarioStore()

  const groups = useMemo(() => {
    const counters: PaletteItem[] = scenario.counters.map((c, i) => ({
      key: `counter-${i}`,
      group: 'Counters',
      label: c.sid,
      searchValue: c.sid,
      icon: Hash,
      type: 'counter' as const,
      path: [i],
    }))

    const interruptions: PaletteItem[] = scenario.interruptions.map((intr, i) => ({
      key: `interruption-${i}`,
      group: 'Interruptions',
      label: intr.sid,
      searchValue: intr.sid,
      icon: Zap,
      type: 'interruption' as const,
      path: [i],
    }))

    const quests: PaletteItem[] = scenario.quests.map((q, qi) => ({
      key: `quest-${qi}`,
      group: 'Quests',
      label: q.sid,
      searchValue: q.sid,
      icon: ScrollText,
      type: 'quest' as const,
      path: [qi],
    }))

    const subquests: PaletteItem[] = scenario.quests.flatMap((q, qi) =>
      q.subQuests.map((sq, sqi) => ({
        key: `subquest-${qi}-${sqi}`,
        group: 'SubQuests',
        label: sq.sid,
        subtitle: q.sid,
        searchValue: `${sq.sid} ${q.sid}`,
        icon: CornerDownRight,
        type: 'subquest' as const,
        path: [qi, sqi],
      }))
    )

    const triggers: PaletteItem[] = scenario.quests.flatMap((q, qi) =>
      q.subQuests.flatMap((sq, sqi) =>
        sq.triggers.map((_, ti) => ({
          key: `trigger-${qi}-${sqi}-${ti}`,
          group: 'Triggers',
          label: `Trigger #${ti + 1}`,
          subtitle: `${q.sid} > ${sq.sid}`,
          searchValue: `trigger ${ti + 1} ${q.sid} ${sq.sid}`,
          icon: GitBranch,
          type: 'trigger' as const,
          path: [qi, sqi, ti],
        }))
      )
    )

    return [
      { heading: 'Counters', items: counters },
      { heading: 'Interruptions', items: interruptions },
      { heading: 'Quests', items: quests },
      { heading: 'SubQuests', items: subquests },
      { heading: 'Triggers', items: triggers },
    ].filter((g) => g.items.length > 0)
  }, [scenario])

  const handleSelect = (item: PaletteItem) => {
    setSelection(item.type, item.path)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-xl gap-0">
        <DialogTitle className="sr-only">Search scenario</DialogTitle>
        <Command>
          <CommandInput autoFocus placeholder="Search counters, quests, triggers…" />
          <CommandList className="max-h-96">
            <CommandEmpty>No results found.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.key}
                    value={item.searchValue}
                    onSelect={() => handleSelect(item)}
                  >
                    <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.subtitle && (
                      <span className="ml-2 text-xs text-muted-foreground truncate max-w-[8rem]">
                        {item.subtitle}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
