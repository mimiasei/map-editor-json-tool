// ─── Unsaved-changes exit confirmation (issue #195 follow-up) ───────────────
// Desktop-only (Tauri's onCloseRequested lets us show a real dialog with a
// "Save" shortcut before quitting; the web build's beforeunload prompt is a
// browser-controlled generic message with no custom buttons, so it doesn't
// use this component). A plain three-way choice — Save / Don't Save /
// Cancel — resolved by the caller via a Promise (see AppShell.tsx's
// askExitChoice), since the actual quit decision happens in an imperative
// window-close handler, not a component that owns this dialog's state.

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

interface UnsavedChangesDialogProps {
  open: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export default function UnsavedChangesDialog({ open, onSave, onDiscard, onCancel }: UnsavedChangesDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('common.unsavedChangesDialog.unsavedChanges')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('common.unsavedChangesDialog.youHaveUnsavedChangesSave')}
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>{t('shared.cancel')}</Button>
          <Button variant="destructive" size="sm" onClick={onDiscard}>{t('common.unsavedChangesDialog.dontSave')}</Button>
          <Button size="sm" onClick={onSave}>{t('shared.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
