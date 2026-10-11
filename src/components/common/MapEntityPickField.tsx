import { MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import MapEntityCombobox from '@/components/common/MapEntityCombobox'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Names the field in the Map Grid's picking banner, e.g. "Quest giver object". */
  label: string
  /** From ScriptTemplateFieldsProps; absent when no map is loaded (no pick button then). */
  requestMapPick?: (label: string, onPicked: (sid: string) => void) => void
}

/** MapEntityCombobox plus a "Pick from map" button that hands off to the Map Grid. */
export default function MapEntityPickField({ value, onChange, placeholder, label, requestMapPick }: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <MapEntityCombobox value={value} onChange={onChange} placeholder={placeholder} />
      </div>
      {requestMapPick && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title="Pick from map"
          onClick={() => requestMapPick(label, onChange)}
        >
          <MapPin className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
