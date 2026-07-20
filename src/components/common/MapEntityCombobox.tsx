import { useState, useMemo } from 'react'
import { useMapContextStore } from '@/store/useMapContextStore'
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

// ─── MapEntityCombobox ────────────────────────────────────────────────────────
// Autocomplete input backed by user-placed entities from the loaded .map file.
// Falls back to a plain text input when no .map file is loaded.

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function MapEntityCombobox({ value, onChange, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const entities = useMapContextStore((s) => s.context?.entities) ?? []

  const sids = useMemo(() => entities.map((e) => e.sid), [entities])

  const filtered = useMemo(
    () => (value ? sids.filter((s) => s.toLowerCase().includes(value.toLowerCase())) : sids),
    [sids, value],
  )

  // Only open when there are entities to suggest
  const isOpen = open && sids.length > 0

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverAnchor asChild>
          <Input
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={placeholder}
            className="pr-7"
          />
        </PopoverAnchor>
        <ChevronsUpDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none opacity-60" />
      </div>

      <PopoverContent
        className="p-0"
        style={{ width: 'var(--radix-popover-anchor-width)' }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              {filtered.length === 0 && sids.length > 0
                ? 'No matches'
                : 'No map entities — load a .map file first'}
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
