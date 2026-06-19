import { useState, useMemo } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { ParamDef } from '@/schema/conditions'
import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { ChevronsUpDown } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type RefType = NonNullable<ParamDef['ref']>

const REF_LABELS: Record<RefType, string> = {
  counter: 'counters',
  quest: 'quests',
  subquest: 'subquests',
  interruption: 'interruptions',
}

interface Props {
  value: string
  onChange: (value: string) => void
  refType: RefType
  placeholder?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SidCombobox({ value, onChange, refType, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const scenario = useScenarioStore((s) => s.scenario)

  // Collect all SIDs for the given ref type from the live scenario
  const sids = useMemo(() => {
    switch (refType) {
      case 'counter':
        return scenario.counters.map((c) => c.sid)
      case 'quest':
        return scenario.quests.map((q) => q.sid)
      case 'subquest':
        return scenario.quests.flatMap((q) => q.subQuests.map((sq) => sq.sid))
      case 'interruption':
        return scenario.interruptions.map((i) => i.sid)
    }
  }, [scenario, refType])

  const filtered = value
    ? sids.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : sids

  // Only open the popover when there are SIDs to suggest; if the pool is
  // empty the field behaves as a plain text input.
  const isOpen = open && sids.length > 0

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      {/* PopoverAnchor positions the dropdown without making the input a
          click-toggle trigger — open/close is driven by focus/blur only. */}
      <div className="relative">
        <PopoverAnchor asChild>
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="pr-7"
          />
        </PopoverAnchor>
        <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none opacity-60" />
      </div>

      <PopoverContent
        className="p-0"
        // Match width of the input field exactly
        style={{ width: 'var(--radix-popover-anchor-width)' }}
        // Don't steal focus from the input when the popover opens
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              {filtered.length === 0 && sids.length > 0 ? 'No matches' : `No ${REF_LABELS[refType]} defined yet`}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((sid) => (
                <CommandItem
                  key={sid}
                  value={sid}
                  onSelect={() => {
                    onChange(sid)
                    setOpen(false)
                  }}
                  className="text-sm"
                >
                  {sid}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
