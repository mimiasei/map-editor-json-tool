// Shown when the Quests tab is chosen with no map loaded: quests belong to a map. The checkbox switches the notice off for good.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NO_MAP_NOTICE_KEY, useViewBridgeStore } from '@/store/useViewBridgeStore'

export default function NoMapNoticeDialog() {
  const { t } = useTranslation()
  const open = useViewBridgeStore((s) => s.noMapNoticeOpen)
  const confirm = useViewBridgeStore((s) => s.confirmGoToQuests)
  const dismiss = useViewBridgeStore((s) => s.dismissNoMapNotice)
  const [dontShow, setDontShow] = useState(false)

  const remember = () => {
    if (!dontShow) return
    try { localStorage.setItem(NO_MAP_NOTICE_KEY, '1') } catch { /* storage unavailable: the notice simply shows again */ }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('layout.noMapNotice.title')}</DialogTitle>
          <DialogDescription>{t('layout.noMapNotice.body')}</DialogDescription>
        </DialogHeader>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
          {t('layout.noMapNotice.dontShowAgain')}
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { remember(); confirm() }}>{t('layout.noMapNotice.continue')}</Button>
          <Button size="sm" onClick={() => { remember(); dismiss() }}>{t('layout.noMapNotice.stay')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
