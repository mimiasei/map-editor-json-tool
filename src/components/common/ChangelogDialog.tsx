// ─── Changelog ────────────────────────────────────────────────────────────────
// The update dialog's release notes link to the repo's commit list. Following that
// link navigated the main webview to github.com, and since the window has no browser
// chrome there was no way back to the editor — the app was effectively gone.
//
// GitHub cannot be embedded either (it sends frame-ancestors 'none'), so this fetches
// the commit list from the API and renders it natively in the same resizable,
// scrollable dialog the Game Database uses.

import { useEffect, useState } from 'react'
import { Dialog, DialogTitle } from '@/components/ui/dialog'
import {
  DraggableDialogContent,
  DraggableDialogDragHandle,
} from '@/components/common/DraggableDialogContent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { openExternal } from '@/lib/native-fs'
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import about from '@/data/about.json'

const COMMITS_API = 'https://api.github.com/repos/mimiasei/map-editor-json-tool/commits?per_page=60'
const COMMITS_WEB = `${about.repository}/commits/main`

interface Commit {
  sha: string
  message: string
  author: string
  date: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ChangelogDialog({ open, onOpenChange }: Props) {
  const [commits, setCommits] = useState<Commit[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setCommits(null)
    setError(null)

    ;(async () => {
      try {
        const res = await fetch(COMMITS_API, { headers: { Accept: 'application/vnd.github+json' } })
        if (!res.ok) throw new Error(`GitHub returned ${res.status}`)
        const raw = (await res.json()) as {
          sha: string
          commit: { message: string; author: { name?: string; date?: string } }
        }[]
        if (cancelled) return
        setCommits(
          raw.map((c) => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split('\n')[0],
            author: c.commit.author?.name ?? '',
            date: c.commit.author?.date ?? '',
          })),
        )
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => { cancelled = true }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent
        className="p-0 gap-0 overflow-hidden"
        defaultWidth={Math.round(window.innerWidth * 0.8)}
        defaultHeight={Math.round(window.innerHeight * 0.8)}
        minWidth={520}
        minHeight={360}
        storageKey="changelog"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DraggableDialogDragHandle className="flex items-center gap-3 px-4 py-2.5 pr-10 border-b border-border shrink-0">
          <DialogTitle className="text-sm font-semibold">Changelog</DialogTitle>
          {commits && (
            <span className="text-[10px] text-muted-foreground">
              {commits.length} most recent commits
            </span>
          )}
        </DraggableDialogDragHandle>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3">
            {!commits && !error && (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching commits…
              </p>
            )}

            {error && (
              <div className="space-y-2 rounded border border-amber-600/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3 w-3" /> Could not load the changelog
                </p>
                <p className="opacity-80">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => openExternal(COMMITS_WEB)}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open on GitHub
                </Button>
              </div>
            )}

            {commits?.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No commits returned.</p>
            )}

            {commits?.map((c) => (
              <div
                key={c.sha}
                className="flex items-start gap-2 border-b border-border/50 px-1 py-1.5 last:border-0"
              >
                <code className="shrink-0 font-mono text-[10px] text-muted-foreground">{c.sha}</code>
                <span className="flex-1 text-xs leading-snug">{c.message}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {c.date ? new Date(c.date).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => openExternal(COMMITS_WEB)}
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open on GitHub
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
