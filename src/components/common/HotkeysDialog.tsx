// ─── Keyboard shortcuts (More > Keyboard shortcuts) ──────────────────────────
// Lists every action from lib/hotkeys.ts, including the Map Grid tools that start unbound. Search to find an action, click its key box and press the
// keys. A key that another action of the same scope already has is offered as a swap instead of being taken silently. Only the changes are stored.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import { DraggableDialogContent, DraggableDialogDragHandle } from '@/components/common/DraggableDialogContent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { HOTKEY_DEFS, comboFromEvent, comboLabel, type HotkeyDef, type HotkeyGroup } from '@/lib/hotkeys'
import { checkCombo, effectiveCombo, useHotkeyStore } from '@/store/useHotkeyStore'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const GROUPS: HotkeyGroup[] = ['app', 'mapEdit', 'mapClipboard', 'mapTools']

/** A key press waiting for the user's answer: `combo` is taken by `otherId`. */
interface PendingConflict { id: string; combo: string; otherId: string }

export default function HotkeysDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const overrides = useHotkeyStore((s) => s.overrides)
  const setCombo = useHotkeyStore((s) => s.setCombo)
  const moveCombo = useHotkeyStore((s) => s.moveCombo)
  const reset = useHotkeyStore((s) => s.reset)
  const resetAll = useHotkeyStore((s) => s.resetAll)
  const [recording, setRecording] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingConflict | null>(null)
  const [reserved, setReserved] = useState(false)
  const [query, setQuery] = useState('')

  const labelOf = (def: HotkeyDef): string => (def.labelKey ? t(def.labelKey as 'shared.objects') : t(`hotkeys.actions.${def.id as 'save'}`))
  const clearNotes = () => { setPending(null); setReserved(false) }

  useEffect(() => {
    if (!open) { setRecording(null); clearNotes(); setQuery('') }
  }, [open])

  // Capture phase and stopPropagation, so the pressed keys never also run the shortcut they are being assigned to.
  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); clearNotes(); return }
      const combo = comboFromEvent(e)
      if (!combo) return
      const check = checkCombo(overrides, recording, combo)
      if (check.status === 'reserved') { setPending(null); setReserved(true); return }
      if (check.status === 'conflict') { setReserved(false); setPending({ id: recording, combo, otherId: check.otherId }); return }
      setCombo(recording, combo)
      setRecording(null)
      clearNotes()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, overrides, setCombo])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return HOTKEY_DEFS.filter((def) => {
      if (!q) return true
      const haystack = [labelOf(def), t(`hotkeys.groups.${def.group}`), comboLabel(effectiveCombo(overrides, def.id))].join(' ').toLowerCase()
      return haystack.includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, overrides, t])

  const otherLabel = pending ? labelOf(HOTKEY_DEFS.find((d) => d.id === pending.otherId)!) : ''

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

        <div className="border-b border-border px-4 py-2 shrink-0">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('hotkeys.search')}
            className="h-8 text-xs"
            autoFocus
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">{t('hotkeys.hint')}</p>
            {matches.length === 0 && <p className="text-xs text-muted-foreground">{t('hotkeys.noMatches')}</p>}
            {GROUPS.map((group) => {
              const defs = matches.filter((d) => d.group === group)
              if (defs.length === 0) return null
              return (
                <div key={group} className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`hotkeys.groups.${group}`)}</p>
                  <div className="rounded border border-border bg-card">
                    {defs.map((def) => {
                      const combo = effectiveCombo(overrides, def.id)
                      const changed = def.id in overrides
                      const isRecording = recording === def.id
                      return (
                        <div key={def.id} className="border-b border-border last:border-b-0">
                          <div className="flex items-center gap-2 px-3 py-1.5">
                            <span className="flex-1 text-xs">{labelOf(def)}</span>
                            <button
                              type="button"
                              onClick={() => { setRecording(isRecording ? null : def.id); clearNotes() }}
                              className={cn(
                                'min-w-28 rounded border px-2 py-1 text-xs',
                                isRecording ? 'border-primary text-primary' : 'border-border hover:bg-accent/50',
                                !combo && !isRecording && 'text-muted-foreground',
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
                          {isRecording && pending && (
                            <div className="flex items-center gap-2 border-t border-border bg-destructive/5 px-3 py-1.5">
                              <p className="flex-1 text-xs text-destructive">
                                {t('hotkeys.conflict', { action: otherLabel })} ({comboLabel(pending.combo)})
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => { moveCombo(pending.id, pending.combo, pending.otherId); setRecording(null); clearNotes() }}
                              >
                                {t('hotkeys.replace')}
                              </Button>
                            </div>
                          )}
                          {isRecording && reserved && (
                            <p className="border-t border-border bg-destructive/5 px-3 py-1.5 text-xs text-destructive">{t('hotkeys.reserved')}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
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
