import { useState } from 'react'
import { useScenarioStore } from '@/store/useScenarioStore'
import { generateDisplayNameSid, dedupeSid } from '@/lib/slugify'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus } from '@/components/ui/icons'
import SidCombobox from './SidCombobox'
import { useTranslation } from 'react-i18next'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Dialog SID field for the "Show Dialog" family of actions — wraps the normal SidCombobox
 *  (pick/type an existing dialog) and adds a quick-create affordance: type the dialog's
 *  message text in a popup, and a dialog sid + a single "start" slide + its localization token
 *  are all generated automatically, using the same naming conventions DialogEditor itself uses
 *  for a freshly-added slide (see defaultTextSid/addSlide in DialogEditor.tsx). This removes
 *  the need to open the full multi-slide editor just to author a one-line dialog. */
export default function DialogSidField({ value, onChange, placeholder }: Props) {
  const { t } = useTranslation()
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
      {!value && (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center"
          onClick={() => setCreating(true)}
        >
          <Plus className="h-4 w-4" />
          {t('common.dialogSidField.createNewDialog')}
        </Button>
      )}

      {/* Closing is deliberate: the X, Cancel and Esc discard the text, and a click outside does nothing, so a long message is not lost by accident. */}
      <Dialog open={creating} onOpenChange={(open) => { if (!open) cancel() }}>
        <DialogContent className="max-w-xl" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('common.dialogSidField.newDialogTitle')}</DialogTitle>
            <DialogDescription>{t('common.dialogSidField.newDialogHint')}</DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('common.dialogSidField.typeTheDialogMessage')}
            rows={8}
            className="resize-y"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" data-skin-large onClick={cancel}>
              {t('shared.cancel')}
            </Button>
            <Button type="button" data-skin-large disabled={!text.trim()} onClick={create}>
              {t('shared.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
