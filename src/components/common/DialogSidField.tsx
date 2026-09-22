import { useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { generateDisplayNameSid, dedupeSid } from '@/lib/slugify'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, X } from 'lucide-react'
import SidCombobox from './SidCombobox'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Dialog SID field for the "Show Dialog" family of actions — wraps the normal SidCombobox
 *  (pick/type an existing dialog) and adds a quick-create affordance: type the dialog's
 *  message text directly, and a dialog sid + a single "start" slide + its localization token
 *  are all generated automatically, using the same naming conventions DialogEditor itself uses
 *  for a freshly-added slide (see defaultTextSid/addSlide in DialogEditor.tsx). This removes
 *  the need to open the full multi-slide editor just to author a one-line dialog. */
export default function DialogSidField({ value, onChange, placeholder }: Props) {
  const [creating, setCreating] = useState(false)
  const [text, setText] = useState('')
  const dialogs = useScenarioStore((s) => s.dialogs)
  const localization = useScenarioStore((s) => s.localization)
  const setDialogFlow = useScenarioStore((s) => s.setDialogFlow)
  const setLocalizationToken = useScenarioStore((s) => s.setLocalizationToken)

  const create = () => {
    const trimmed = text.trim()
    if (!trimmed) return

    const dialogSid = generateDisplayNameSid(trimmed, Object.keys(dialogs), 'dialog')
    const textSid = dedupeSid(`${dialogSid}_text_1`, Object.keys(localization))

    setLocalizationToken(textSid, trimmed)
    setDialogFlow(dialogSid, {
      id: dialogSid,
      localization: true,
      slides: [{ id: 'start', fon: '', text: textSid, end: true }],
    })

    onChange(dialogSid)
    setText('')
    setCreating(false)
  }

  const cancel = () => {
    setText('')
    setCreating(false)
  }

  return (
    <div className="space-y-1">
      <SidCombobox value={value} onChange={onChange} refType="dialog" placeholder={placeholder} />
      {value ? null : creating ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                create()
              }
              if (e.key === 'Escape') cancel()
            }}
            placeholder="Type the dialog message…"
            className="flex-1"
          />
          <Button
            type="button"
            className="shrink-0"
            disabled={!text.trim()}
            onClick={create}
          >
            Create
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            onClick={cancel}
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" />
          Create new dialog
        </Button>
      )}
    </div>
  )
}
