// ─── Map Grid — everything about the Select tool, in one place ────────────────
// Replaces the row of bare icons that used to sit in the toolbar. Every action is a labelled button with its shortcut, Delete is red and
// set apart from the rest, and its confirmation names the count and never says just "Confirm" (a tester once took the Clear All trash
// icon, which sat next to the delete-selected one, for "delete the selected objects").

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Freehand, RectSelect, ClipboardCopy, ClipboardPaste, FlipHorizontal, Percent, RotateCw, Trash2, X } from '@/components/ui/icons'
import { comboLabel } from '@/lib/hotkeys'
import { useHotkeyCombo } from '@/store/useHotkeyStore'
import ToolToaster from './ToolToaster'

interface Props {
  mode: 'select' | 'paste'
  selectedCount: number
  canEdit: boolean
  hasClipboard: boolean
  /** The selection holds encounters the scaler can work on. */
  canScale: boolean
  deleteConfirming: boolean
  shape: 'rectangle' | 'lasso'
  onShape: (shape: 'rectangle' | 'lasso') => void
  note: string | null
  /** The prefab library button, rendered by the caller (it owns the clipboard and paste hand-over). */
  prefabs: ReactNode
  onCopy: () => void
  onPaste: () => void
  onFlip: () => void
  onTurn: () => void
  onScale: () => void
  onClearSelection: () => void
  onDelete: () => void
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onClose: () => void
}

export default function SelectionToaster(p: Props) {
  const { t } = useTranslation()
  const label = (combo: string) => (combo ? ` (${comboLabel(combo)})` : '')
  const copyKey = label(useHotkeyCombo('gridCopy'))
  const pasteKey = label(useHotkeyCombo('gridPaste'))
  const flipKey = label(useHotkeyCombo('gridFlip'))
  const rotateKey = label(useHotkeyCombo('gridRotate'))
  const deleteKey = label(useHotkeyCombo('gridDelete'))
  const escKey = ' (Esc)'
  const none = p.selectedCount === 0
  const row = 'h-7 w-full justify-start gap-2 px-2 text-xs'

  return (
    <ToolToaster
      title={t('mapGrid.mapGridDialog.copy.select')}
      closeTitle={t('mapGrid.mapGridDialog.stopEsc')}
      onClose={p.onClose}
    >
      <p className="font-medium">
        {p.mode === 'paste' ? t('mapGrid.mapGridDialog.copy.pasting') : t('mapGrid.mapGridDialog.copy.selected', { count: p.selectedCount })}
      </p>
      {p.mode === 'select' && (
        <div className="space-y-1">
          <div className="grid grid-cols-2 overflow-hidden rounded border border-border">
            {(['rectangle', 'lasso'] as const).map((shape) => (
              <button
                key={shape}
                type="button"
                aria-pressed={p.shape === shape}
                className={`flex h-7 items-center justify-center gap-1.5 text-xs transition-colors ${p.shape === shape ? 'bg-secondary font-medium text-secondary-foreground' : 'text-foreground/60 hover:bg-accent'}`}
                onClick={() => p.onShape(shape)}
              >
                {shape === 'rectangle' ? <RectSelect className="h-3.5 w-3.5" /> : <Freehand className="h-3.5 w-3.5" />}
                {t(shape === 'rectangle' ? 'mapGrid.mapGridDialog.copy.shapeRectangle' : 'mapGrid.mapGridDialog.copy.shapeLasso')}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground">
            {p.shape === 'rectangle'
              ? `${t('mapGrid.mapGridDialog.rectHint.square')} · ${t('mapGrid.mapGridDialog.rectHint.fromCentre')}`
              : t('mapGrid.mapGridDialog.copy.lassoHint')}
          </p>
        </div>
      )}
      <p className="text-muted-foreground">
        {p.mode === 'paste' ? t('mapGrid.mapGridDialog.copy.pasteHint') : none ? t('mapGrid.mapGridDialog.copy.hint') : t('mapGrid.mapGridDialog.copy.hintMore')}
      </p>

      <div className="space-y-0.5">
        {p.mode === 'select' && (
          <Button variant="outline" size="sm" className={row} disabled={none} onClick={p.onCopy} title={t('mapGrid.mapGridDialog.copy.copyTitle')}>
            <ClipboardCopy className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.copy')}{copyKey}
          </Button>
        )}
        <Button variant="outline" size="sm" className={row} disabled={!p.hasClipboard || p.mode === 'paste'} onClick={p.onPaste} title={t('mapGrid.mapGridDialog.copy.pasteTitle')}>
          <ClipboardPaste className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.paste')}{pasteKey}
        </Button>
        {p.mode === 'paste' && (
          <>
            <Button variant="outline" size="sm" className={row} onClick={p.onFlip} title={t('mapGrid.mapGridDialog.copy.flipTitle')}>
              <FlipHorizontal className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.flip')}{flipKey}
            </Button>
            <Button variant="outline" size="sm" className={row} onClick={p.onTurn} title={t('mapGrid.mapGridDialog.copy.rotateTitle')}>
              <RotateCw className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.turn')}{rotateKey}
            </Button>
          </>
        )}
        {p.prefabs}
        {p.mode === 'select' && p.canEdit && p.canScale && (
          <Button variant="outline" size="sm" className={row} onClick={p.onScale}>
            <Percent className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.scale')}
          </Button>
        )}
        {p.mode === 'select' && (
          <Button variant="outline" size="sm" className={row} disabled={none} onClick={p.onClearSelection}>
            <X className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.clearSelection')}{escKey}
          </Button>
        )}
      </div>

      {p.mode === 'select' && p.canEdit && (
        <div className="space-y-1 border-t border-border pt-1.5">
          {p.deleteConfirming ? (
            <>
              <p className="font-medium text-destructive">{t('mapGrid.mapGridDialog.copy.deleteCount', { count: p.selectedCount })}</p>
              <div className="flex gap-1">
                <Button variant="destructive" size="sm" className="h-7 flex-1 text-xs" onClick={p.onDeleteConfirm}>
                  <Trash2 className="h-3.5 w-3.5" />{t('mapGrid.mapGridDialog.copy.deleteNow')}
                </Button>
                <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={p.onDeleteCancel}>
                  {t('mapGrid.mapGridDialog.copy.keep')}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="destructive" size="sm" className="h-7 w-full gap-2 text-xs" disabled={none} onClick={p.onDelete} title={t('mapGrid.mapGridDialog.copy.deleteTitle')}>
              <Trash2 className="h-3.5 w-3.5" />
              {none ? t('mapGrid.mapGridDialog.copy.deleteNone') : t('mapGrid.mapGridDialog.copy.delete', { count: p.selectedCount })}{deleteKey}
            </Button>
          )}
        </div>
      )}

      {p.note && <p className="text-muted-foreground">{p.note}</p>}
    </ToolToaster>
  )
}
