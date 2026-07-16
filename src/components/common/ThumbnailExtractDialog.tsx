// ─── ThumbnailExtractDialog ───────────────────────────────────────────────────
// Three-state dialog: idle → running → done
// Invokes the extract_thumbnails Tauri command and streams progress via events.

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, FolderOpen, AlertTriangle } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'
import { loadThumbnailManifest } from '@/hooks/useThumbnailManifest'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Phase = 'idle' | 'running' | 'done' | 'error'

interface ProgressState {
  done: number
  total: number
  current: string
}

interface DoneState {
  saved: number
  missing: string[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Try to auto-detect the game directory from common install paths. */
async function detectGameDir(): Promise<string | null> {
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    const { exists } = await import('@tauri-apps/plugin-fs')

    const candidates = [
      // Steam default on Windows
      'C:/Program Files (x86)/Steam/steamapps/common/Heroes of Might and Magic Olden Era',
      'C:/Program Files/Steam/steamapps/common/Heroes of Might and Magic Olden Era',
      // Steam on macOS
      `${home}/Library/Application Support/Steam/steamapps/common/Heroes of Might and Magic Olden Era`,
      // Steam on Linux
      `${home}/.steam/steam/steamapps/common/Heroes of Might and Magic Olden Era`,
      `${home}/.local/share/Steam/steamapps/common/Heroes of Might and Magic Olden Era`,
    ]

    for (const c of candidates) {
      if (await exists(c)) return c
    }
  } catch {
    // ignore
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ThumbnailExtractDialog({ open, onOpenChange }: Props) {
  const catalog = useCatalogStore((s) => s.catalog)

  const [gameDir, setGameDir] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, current: '' })
  const [done, setDone] = useState<DoneState | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  // Auto-detect on first open
  useEffect(() => {
    if (!open || gameDir) return
    setDetecting(true)
    detectGameDir().then((dir) => {
      if (dir) setGameDir(dir)
      setDetecting(false)
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for progress events
  useEffect(() => {
    if (!open || phase !== 'running') return

    let unlisten: (() => void) | undefined
    ;(async () => {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen<ProgressState>('thumbnail-progress', (event) => {
        setProgress(event.payload)
      })
    })()

    return () => { unlisten?.() }
  }, [open, phase])

  const handleExtract = async () => {
    if (!gameDir.trim()) return

    setPhase('running')
    setProgress({ done: 0, total: 0, current: '' })
    setErrorMsg('')

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { appLocalDataDir } = await import('@tauri-apps/api/path')

      const outputDir = `${(await appLocalDataDir()).replace(/\\/g, '/')}thumbnails`

      // Collect all icon SIDs from the catalog
      const icons: string[] = []
      const mapObjectIcons: string[] = []

      if (catalog) {
        for (const h of catalog.heroes)    if (h.icon) icons.push(h.icon)
        for (const c of catalog.creatures) if (c.icon) icons.push(c.icon)
        for (const a of catalog.artifacts) if (a.icon) icons.push(a.icon)
        for (const s of catalog.spells)    if (s.icon) icons.push(s.icon)
        for (const s of catalog.skills)    if (s.icon) icons.push(s.icon)
        for (const b of catalog.buffs)     if (b.icon) icons.push(b.icon)
        for (const o of catalog.mapObjects) {
          // mapObjects have no icon field in the catalog — use their id
          mapObjectIcons.push(o.id)
        }
      }

      const result = await invoke<{ saved: number; missing: string[] }>('extract_thumbnails', {
        gameDir: gameDir.trim(),
        outputDir,
        icons: [...new Set(icons)],
        mapObjectIcons: [...new Set(mapObjectIcons)],
      })

      // Reload manifest so thumbnailPath() activates immediately
      await loadThumbnailManifest()

      setDone({ saved: result.saved, missing: result.missing })
      setPhase('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  const handleClose = () => {
    if (phase === 'running') return
    setPhase('idle')
    setDone(null)
    setErrorMsg('')
    onOpenChange(false)
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extract Game Thumbnails</DialogTitle>
        </DialogHeader>

        {/* ── Idle ── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select your Heroes of Might and Magic: Olden Era installation folder.
              Icons will be extracted to the app data directory and shown in all dropdowns.
            </p>

            {!catalog && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  Load Game Data first (More → Game Data) so the extractor knows which icons to look for.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Input
                value={detecting ? 'Detecting…' : gameDir}
                onChange={(e) => setGameDir(e.target.value)}
                placeholder="Path to game installation folder"
                disabled={detecting}
                className="flex-1 text-xs font-mono"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={detecting}
                onClick={async () => {
                  const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
                  const path = await openDialog({ directory: true, title: 'Select game folder' })
                  if (typeof path === 'string') setGameDir(path)
                }}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>

            {phase === 'error' && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">{errorMsg}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── Running ── */}
        {phase === 'running' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="truncate">
                {progress.current ? `Extracting: ${progress.current}` : 'Starting…'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {progress.done} / {progress.total || '?'} icons
            </p>
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && done && (
          <div className="space-y-2 text-sm">
            <p className="text-green-600 dark:text-green-400 font-medium">
              Extraction complete — {done.saved} icon{done.saved !== 1 ? 's' : ''} saved.
            </p>
            {done.missing.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {done.missing.length} icon{done.missing.length !== 1 ? 's' : ''} not found in game files.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Icons will appear in dropdowns immediately.
            </p>
          </div>
        )}

        <DialogFooter>
          {(phase === 'idle' || phase === 'error') && (
            <>
              <Button variant="ghost" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleExtract} disabled={!gameDir.trim() || !catalog}>
                Extract
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="ghost" disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Extracting…
            </Button>
          )}
          {phase === 'done' && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
