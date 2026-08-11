import { useState, useMemo, useRef } from 'react'
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
  dialog: 'dialogs',
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
  const inputRef = useRef<HTMLInputElement>(null)
  const scenario = useScenarioStore((s) => s.scenario)
  // Dialogs live as a sibling of `scenario` in the store, keyed by dialog SID — not part
  // of the scenario JSON itself, since they're a separate flow file per dialog.
  const dialogs = useScenarioStore((s) => s.dialogs)

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
      case 'dialog':
        // Only dialogs created so far in this file — not the full Core.zip dialog set —
        // so this only ever offers something that actually exists to link to.
        return Object.keys(dialogs)
    }
  }, [scenario, dialogs, refType])

  const filtered = value
    ? sids.filter((s) => s.toLowerCase().includes(value.toLowerCase()))
    : sids

  // Only open the popover when there are SIDs to suggest; if the pool is
  // empty the field behaves as a plain text input.
  const isOpen = open && sids.length > 0

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverAnchor asChild>
          <Input
            ref={inputRef}
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
        style={{ width: 'var(--radix-popover-anchor-width)' }}
        // Don't steal focus from the input when the popover opens
        onOpenAutoFocus={(e) => e.preventDefault()}
        // Only exclude the anchor input itself from Radix's own outside-
        // interaction dismissal (without it, re-focusing/clicking the input
        // while open registers as "outside" and immediately re-closes the
        // popover Radix just opened, since the anchor is a sibling of
        // PopoverContent, not inside it) — everything else closes/doesn't
        // close exactly as Radix already decides. Previously this blanket-
        // prevented all outside interaction and relied solely on the
        // input's onBlur (with a setTimeout) to close instead; that also
        // fired on any focus loss, including dragging this list's own
        // scrollbar, closing the dropdown mid-scroll.
        onInteractOutside={(e) => {
          if (e.target === inputRef.current) e.preventDefault()
        }}
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
