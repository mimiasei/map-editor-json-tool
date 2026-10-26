// ─── File > Open Recent... ───────────────────────────────────────────────────
// The files opened before (see recent-files.ts), newest first. Clicking one opens it; the entry's X forgets it.

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Cancel } from '@/components/ui/icons'
import { clearRecentFiles, getRecentFiles, removeRecentFile, type RecentFile } from '@/lib/recent-files'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (file: RecentFile) => void
}

const KIND_LABEL = { map: 'Map', json: 'Project' } as const

function folderOf(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.slice(0, normalized.lastIndexOf('/')) || normalized
}

export default function OpenRecentDialog({ open, onOpenChange, onPick }: Props) {
  const [files, setFiles] = useState<RecentFile[]>([])
  useEffect(() => {
    if (open) setFiles(getRecentFiles())
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Open recent</DialogTitle>
        </DialogHeader>
        {files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing opened yet. Maps and projects you open will be listed here.</p>
        ) : (
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50">
            {files.map((f) => (
              <li key={f.path} className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 min-w-0 py-2 px-1 text-left hover:bg-accent rounded"
                  title={f.path}
                  onClick={() => onPick(f)}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-medium truncate">{f.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">{KIND_LABEL[f.kind]}</span>
                  </span>
                  <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                    <span className="truncate">{folderOf(f.path)}</span>
                    <span className="shrink-0">{new Date(f.openedAt).toLocaleString()}</span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  title="Remove from this list"
                  onClick={() => {
                    removeRecentFile(f.path)
                    setFiles(getRecentFiles())
                  }}
                >
                  <Cancel className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                clearRecentFiles()
                setFiles([])
              }}
            >
              Clear list
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
