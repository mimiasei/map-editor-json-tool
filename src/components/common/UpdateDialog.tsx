import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useScenarioStore } from '@/store/useScenarioStore'
import { installUpdate } from '@/lib/updater'
import type { AvailableUpdate } from '@/lib/updater'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, ArrowRight, Download, Loader2 } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  update: AvailableUpdate | null
}

type Phase = 'confirm' | 'working'

export default function UpdateDialog({ open, onOpenChange, update }: Props) {
  const isDirty = useScenarioStore((s) => s.isDirty)
  const [phase, setPhase] = useState<Phase>('confirm')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!update) return null

  const handleInstall = async () => {
    setPhase('working')
    setError(null)
    setProgress(null)
    try {
      await installUpdate(setProgress)
      // Normally unreachable: the app exits or relaunches inside installUpdate().
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('confirm')
    }
  }

  const pct = progress === null ? null : Math.round(progress * 100)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-download would leave the install running with no feedback.
        if (phase === 'working') return
        onOpenChange(next)
      }}
    >
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={620}
        defaultHeight={560}
        minWidth={460}
        minHeight={360}
        storageKey="update"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DraggableDialogDragHandle className="px-6 pt-6 pb-3 pr-10 border-b border-border shrink-0">
          <DialogTitle>Update available</DialogTitle>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="font-mono text-xs">
              {update.currentVersion}
            </Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge className="font-mono text-xs">{update.version}</Badge>
            {update.date && (
              <span className="ml-auto text-xs text-muted-foreground">{update.date}</span>
            )}
          </div>
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-4 space-y-3">
            {update.notes ? (
              <div className="prose-sm max-w-none text-sm [&_a]:text-primary [&_code]:font-mono [&_code]:text-xs [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:my-0.5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{update.notes}</ReactMarkdown>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No release notes were published for this version.
              </p>
            )}

            <p className="rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
              The app will restart to finish installing. Your current file and any unsaved
              changes are saved first and reopened automatically.
            </p>

            {isDirty && phase === 'confirm' && (
              <p className="flex items-start gap-1.5 rounded border border-amber-600/40 bg-amber-500/10 p-2 text-xs text-amber-600">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                You have unsaved changes. They will be restored after the update, but saving
                first is safer.
              </p>
            )}

            {phase === 'working' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{pct === 100 ? 'Installing…' : 'Downloading…'}</span>
                  <span>{pct === null ? '' : `${pct}%`}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                  <div
                    className={`h-full bg-primary transition-[width] ${pct === null ? 'w-1/3 animate-pulse' : ''}`}
                    style={pct === null ? undefined : { width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        </ScrollArea>

        <div className="px-6 py-3 border-t border-border flex items-center gap-2 shrink-0">
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            disabled={phase === 'working'}
            onClick={() => onOpenChange(false)}
          >
            Later
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={phase === 'working'}
            onClick={handleInstall}
          >
            {phase === 'working' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Install and restart
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
