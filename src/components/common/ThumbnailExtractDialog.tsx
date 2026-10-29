// ─── ThumbnailExtractDialog ───────────────────────────────────────────────────
// Three-state dialog: idle → running → done
// Invokes the extract_thumbnails Tauri command and streams progress via events.

import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, FolderOpen, AlertTriangle } from '@/components/ui/icons'
import { useCatalogStore } from '@/store/useCatalogStore'
import { loadThumbnailManifest } from '@/hooks/useThumbnailManifest'
import { buildIconRequests, onlyNewRequests, recordExtractedRequests } from '@/lib/catalog/icon-requests'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const catalog = useCatalogStore((s) => s.catalog)

  const [gameDir, setGameDir] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressState>({ done: 0, total: 0, current: '' })
  const [done, setDone] = useState<DoneState | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [everything, setEverything] = useState(false)

  // After an earlier extraction only the names it never asked for need extracting; the sidecar keeps the rest.
  const requests = useMemo(() => buildIconRequests(catalog), [catalog])
  const onlyNew = useMemo(() => {
    const part = onlyNewRequests(requests)
    return part && part.icons.length + part.mapObjectIcons.length > 0 ? part : null
  }, [requests, open]) // eslint-disable-line react-hooks/exhaustive-deps
  const newCount = onlyNew ? new Set([...onlyNew.icons, ...onlyNew.mapObjectIcons]).size : 0

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

      const rawDir = await appLocalDataDir()
      // Normalise to forward slashes and guarantee a trailing separator so the
      // sidecar receives a valid output path on all platforms.
      const outputDir = `${rawDir.replace(/\\/g, '/').replace(/\/?$/, '/')}thumbnails`

      // Which icons to extract — shared with the first-run wizard.
      const { icons, mapObjectIcons } = onlyNew && !everything ? onlyNew : requests

      const result = await invoke<{ saved: number; missing: string[] }>('extract_thumbnails', {
        gameDir: gameDir.trim(),
        outputDir,
        icons,
        mapObjectIcons,
      })

      // Reload manifest so thumbnailPath() activates immediately
      // Record what we asked for so the app stops prompting for a re-run, and tell
      // any open banner it can go away.
      recordExtractedRequests(requests)
      window.dispatchEvent(new Event('oe:thumbnails-extracted'))

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
          <DialogTitle>{t('common.thumbnailExtractDialog.extractGameThumbnails')}</DialogTitle>
        </DialogHeader>

        {/* ── Idle ── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('common.thumbnailExtractDialog.selectYourHeroesOfMight')}
            </p>

            {onlyNew && (
              <div className="space-y-2">
                <p className="text-sm">
                  {t('common.thumbnailExtractDialog.newImages', { count: newCount })}
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={everything} onCheckedChange={(v) => setEverything(v === true)} />
                  {t('common.thumbnailExtractDialog.extractEverythingAgain')}
                </label>
              </div>
            )}

            {!catalog && (
              <Alert className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2 text-xs">
                  {t('common.thumbnailExtractDialog.loadGameDataFirstMore')}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Input
                value={detecting ? t('shared.detecting') : gameDir}
                onChange={(e) => setGameDir(e.target.value)}
                placeholder={t('common.thumbnailExtractDialog.pathToGameInstallationFolder')}
                disabled={detecting}
                className="flex-1 text-xs font-mono"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={detecting}
                onClick={async () => {
                  const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
                  const path = await openDialog({ directory: true, title: t('common.thumbnailExtractDialog.selectGameFolder') })
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
              <span className="min-w-0 truncate" title={progress.current || undefined}>
                {progress.current ? `Extracting: ${progress.current}` : t('common.thumbnailExtractDialog.starting')}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">
              {t('shared.iconProgress', { done: progress.done, total: progress.total || '?' })}
            </p>
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && done && (
          <div className="space-y-2 text-sm">
            <p className="text-green-600 dark:text-green-400 font-medium">
              {t('common.thumbnailExtractDialog.complete', { count: done.saved })}
            </p>
            {done.missing.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {t('common.thumbnailExtractDialog.notFound', { count: done.missing.length })}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t('common.thumbnailExtractDialog.iconsWillAppearInDropdowns')}
            </p>
          </div>
        )}

        <DialogFooter>
          {(phase === 'idle' || phase === 'error') && (
            <>
              <Button variant="ghost" onClick={handleClose}>{t('shared.cancel')}</Button>
              <Button onClick={handleExtract} disabled={!gameDir.trim() || !catalog}>
                {t('common.thumbnailExtractDialog.extract')}
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="ghost" disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('common.thumbnailExtractDialog.extracting')}
            </Button>
          )}
          {phase === 'done' && (
            <Button onClick={handleClose}>{t('ui.close')}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
