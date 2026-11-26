import WinConditionsEditor from '@/components/common/WinConditionsEditor'
import type { ClassicSettings } from '@/lib/rmg/classic-presets'
import { DEFAULT_WIN_OPTIONS, type WinConditionId, type WinOptions } from '@/lib/rmg/win-conditions'

interface Props {
  settings: ClassicSettings
  onChange: (update: (prev: ClassicSettings) => ClassicSettings) => void
  disabled?: boolean
}

/** The Generate Random Map dialog's win conditions: the shared editor over the generator settings. */
export default function WinConditionsPanel({ settings, onChange, disabled }: Props) {
  const setOptions = (patch: Partial<WinOptions>) => onChange((prev) => ({ ...prev, winOptions: { ...(prev.winOptions ?? DEFAULT_WIN_OPTIONS), ...patch } }))
  const setActive = (next: WinConditionId[]) => onChange((prev) => ({ ...prev, winConditions: next.length === 1 && next[0] === 'classic' ? undefined : next }))
  return (
    <WinConditionsEditor
      active={settings.winConditions ?? ['classic']}
      options={settings.winOptions ?? DEFAULT_WIN_OPTIONS}
      onActiveChange={setActive}
      onOptionsChange={setOptions}
      disabled={disabled}
      idPrefix="rmg-win"
    />
  )
}
