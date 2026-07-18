import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { GuidesContent } from './GuidesPanel'
import UndockButton from '@/components/panels/UndockButton'

interface GuidesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when the user clicks the undock button. Tauri-only. */
  onUndock?: () => void
  /** True while the panel is already open in a separate window. */
  undocked?: boolean
}

export default function GuidesDialog({ open, onOpenChange, onUndock, undocked }: GuidesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0"
        defaultWidth={700}
        defaultHeight={600}
        minWidth={500}
        minHeight={400}
      >
        <DialogTitle className="sr-only">Guides</DialogTitle>

        {/* Header — acts as the drag handle */}
        <DraggableDialogDragHandle className="flex items-center px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold">Guides</span>

          {/* UndockButton — stop propagation so clicking it doesn't start a drag */}
          {onUndock && (
            <div
              className="group ml-auto mr-6"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <UndockButton panelId="guides" onUndock={onUndock} disabled={undocked} />
            </div>
          )}
        </DraggableDialogDragHandle>

        <div className="flex-1 min-h-0 overflow-hidden">
          <GuidesContent />
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
