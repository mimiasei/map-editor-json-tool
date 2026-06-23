import { useState, useMemo } from 'react'
import { ENTITY_REGISTRIES, ENTITY_LABELS } from '@/schema/entities'
import type { EntityCategory } from '@/schema/entities'
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

interface Props {
  value: string
  onChange: (value: string) => void
  category: EntityCategory
  placeholder?: string
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Searchable combobox backed by a static entity registry (heroes, creatures,
 * artifacts, or map objects). Searches by both ID and display label.
 * Free-text entry is always accepted — unknown IDs are written through as-is,
 * keeping the tool forward-compatible with future game content.
 */
export default function EntityCombobox({ value, onChange, category, placeholder }: Props) {
  const [open, setOpen] = useState(false)

  const registry = ENTITY_REGISTRIES[category]

  // Filter by ID or label; show all when the field is empty.
  const filtered = useMemo(() => {
    if (!value) return registry
    const q = value.toLowerCase()
    return registry.filter(
      (e) => e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
    )
  }, [registry, value])

  const isOpen = open

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
              {filtered.length === 0
                ? `No matching ${ENTITY_LABELS[category]}`
                : `No ${ENTITY_LABELS[category]} found`}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((entry) => (
                <CommandItem
                  key={entry.id}
                  value={entry.id}
                  onSelect={() => {
                    onChange(entry.id)
                    setOpen(false)
                  }}
                  className="flex justify-between gap-2 text-sm"
                >
                  <span>{entry.label}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate max-w-[45%]">
                    {entry.id}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
