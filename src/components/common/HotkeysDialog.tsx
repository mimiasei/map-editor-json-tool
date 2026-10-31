// ─── Keyboard shortcuts (More > Keyboard shortcuts) ──────────────────────────
// Lists every shortcut from lib/hotkeys.ts. Click a combo, press the new keys; Esc cancels. Only the changes are stored.

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { HOTKEY_DEFS, comboFromEvent, comboLabel, type HotkeyScope } from '@/lib/hotkeys'
import { effectiveCombo, findHotkeyConflict, useHotkeyStore } from '@/store/useHotkeyStore'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SCOPES: HotkeyScope[] = ['global', 'mapGrid']

export default function HotkeysDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const overrides = useHotkeyStore((s) => s.overrides)
  const setCombo = useHotkeyStore((s) => s.setCombo)
  const reset = useHotkeyStore((s) => s.reset)
  const resetAll = useHotkeyStore((s) => s.resetAll)
  const [recording, setRecording] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setRecording(null); setConflict(null) }
  }, [open])

  // Capture phase and stopPropagation, so the pressed keys never also run the shortcut they are being assigned to.
  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); setConflict(null); return }
      const combo = comboFromEvent(e)
      if (!combo) return
      const other = findHotkeyConflict(overrides, recording, combo)
      if (other) { setConflict(other); return }
      setCombo(recording, combo)
      setRecording(null)
      setConflict(null)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, overrides, setCombo])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={520}
        defaultHeight={560}
        minWidth={420}
        minHeight={320}
        storageKey="hotkeys"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">{t('hotkeys.title')}</DialogTitle>
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">{t('hotkeys.hint')}</p>
            {SCOPES.map((scope) => (
              <div key={scope} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`hotkeys.scopes.${scope}`)}</p>
                <div className="rounded border border-border bg-card">
                  {HOTKEY_DEFS.filter((d) => d.scope === scope).map((def) => {
                    const combo = effectiveCombo(overrides, def.id)
                    const changed = def.id in overrides
                    const isRecording = recording === def.id
                    return (
                      <div key={def.id} className="flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
                        <span className="flex-1 text-xs">{t(`hotkeys.actions.${def.id as 'save'}`)}</span>
                        <button
                          type="button"
                          onClick={() => { setRecording(isRecording ? null : def.id); setConflict(null) }}
                          className={cn(
                            'min-w-28 rounded border px-2 py-1 text-xs',
                            isRecording ? 'border-primary text-primary' : 'border-border hover:bg-accent/50',
                          )}
                        >
                          {isRecording ? t('hotkeys.pressKeys') : combo ? comboLabel(combo) : t('hotkeys.none')}
                        </button>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={!combo} onClick={() => setCombo(def.id, '')}>
                          {t('hotkeys.clear')}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={!changed} onClick={() => reset(def.id)}>
                          {t('hotkeys.reset')}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {conflict && (
              <p className="text-xs text-destructive">
                {t('hotkeys.conflict', { action: t(`hotkeys.actions.${conflict as 'save'}`) })}
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <Button variant="outline" size="sm" onClick={resetAll} disabled={Object.keys(overrides).length === 0}>
            {t('hotkeys.resetAll')}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('ui.close')}
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
