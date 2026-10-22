import { useMapContextStore } from '@/store/useMapContextStore'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Without a loaded .map the slot count is unknown; 4 is what the old fixed dropdowns offered. */
const FALLBACK_PLAYERS = 4

interface Props {
  /** The game's 0-based player index as a string ("0" = Player 1). */
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** The one way to pick a player in TSE: shows "Player N", stores the 0-based index the game uses. */
export default function PlayerSelect({ value, onChange, placeholder }: Props) {
  const playersCount = useMapContextStore((s) => s.context?.playersCount) || FALLBACK_PLAYERS
  const options = Array.from({ length: playersCount }, (_, i) => String(i))
  if (value !== '' && !options.includes(value)) options.push(value)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder ?? 'Select player…'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {/^\d+$/.test(o) ? `Player ${Number(o) + 1}` : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
