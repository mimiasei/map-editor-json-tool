// ─── About ────────────────────────────────────────────────────────────────────
// Static facts live in src/data/about.json so they are edited as data, not markup.
// Version and build date come from the running binary instead: the version from
// tauri.conf.json via getVersion(), the date stamped in by vite.config.ts, so neither
// can go stale in a checked-in file.

import { useEffect, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { isTauri, openExternal } from '@/lib/native-fs'
import { ExternalLink } from 'lucide-react'
import about from '@/data/about.json'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs">{children}</span>
    </div>
  )
}

/** Best-effort human date; falls back to the raw value if it will not parse. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })
}

export default function AboutDialog({ open, onOpenChange }: Props) {
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !isTauri()) return
    ;(async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app')
        setVersion(await getVersion())
      } catch {
        setVersion(null)
      }
    })()
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={560}
        defaultHeight={520}
        minWidth={420}
        minHeight={320}
        storageKey="about"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DraggableDialogDragHandle className="flex items-center px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">About</DialogTitle>
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-3">
            <div>
              <p className="text-base font-semibold leading-tight">{about.app}</p>
              <p className="text-xs text-muted-foreground">{about.tagline}</p>
            </div>

            <div className="rounded border border-border bg-card px-3 py-2">
              <Row label="Version">
                {version ? `v${version}` : <span className="text-muted-foreground">web build</span>}
              </Row>
              <Row label="Built">{formatDate(__BUILD_DATE__)}</Row>
              <Row label="Game">{about.game}</Row>
              <Row label="Created by">{about.creator}</Row>
              <Row label="License">{about.license}</Row>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Built with
              </p>
              <ul className="space-y-0.5">
                {about.stack.map((item) => (
                  <li key={item} className="text-xs text-muted-foreground">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          {/* Opens in the system browser — never in this webview, which has no way back. */}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => openExternal(about.repository)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Repository
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => openExternal(about.issues)}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Report an issue
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DraggableDialogContent>
    </Dialog>
  )
}
