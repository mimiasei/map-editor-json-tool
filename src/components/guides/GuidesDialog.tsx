import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
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
      <DialogContent
        className="flex flex-col p-0 overflow-hidden gap-0"
        style={{ resize: 'both', minWidth: '500px', minHeight: '400px', maxWidth: '90vw', maxHeight: '90vh', width: '700px', height: '600px' }}
      >
        <DialogTitle className="sr-only">Guides</DialogTitle>

        {/* UndockButton overlaid in the dialog title area */}
        {onUndock && (
          <div className="group absolute top-3 right-10 z-10">
            <UndockButton panelId="guides" onUndock={onUndock} disabled={undocked} />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold">Guides</span>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          <GuidesContent />
        </div>
      </DialogContent>
    </Dialog>
  )
}
