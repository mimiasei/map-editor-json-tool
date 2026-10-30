// ─── SetupDialog ──────────────────────────────────────────────────────────────
// First-run wizard shown on initial launch (Tauri only).
// Phase 1: loads Core.zip from the game folder (derives path automatically).
// Phase 2: runs the extract_thumbnails sidecar against the same game folder.
// Both steps are triggered by a single "Set up editor" button click.

import { useState, useEffect, useRef } from 'react'
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
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, FolderOpen, AlertTriangle, CheckCircle2, Database, ImageIcon } from '@/components/ui/icons'
import { useCatalogStore } from '@/store/useCatalogStore'
import { loadThumbnailManifest } from '@/hooks/useThumbnailManifest'
import { buildIconRequests, recordExtractedRequests } from '@/lib/catalog/icon-requests'
import { getGameDir, streamingAssetsPath } from '@/lib/game-dir'
import { useTranslation, Trans } from 'react-i18next'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Phase =
  | 'idle'          // waiting for user input
  | 'loading-zip'   // phase 1: loading Core.zip
  | 'extracting'    // phase 2: running thumbnail sidecar
  | 'done'          // both phases complete
  | 'error'         // unrecoverable error

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

/** Derive the Core.zip path from a game installation root. */
function coreZipPath(gameDir: string): string {
  return streamingAssetsPath(gameDir, 'Core.zip')
}

/** The game folder as found by the app — chosen in the Windows installer, or
 *  the Steam library holding the game (game-dir.ts / src-tauri game_dir.rs). */
const detectGameDir = getGameDir

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetupDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation()
  const [gameDir, setGameDir]             = useState('')
  const [detecting, setDetecting]         = useState(false)
  const [phase, setPhase]                 = useState<Phase>('idle')
  const [zipError, setZipError]           = useState('')
  const [progress, setProgress]           = useState<ProgressState>({ done: 0, total: 0, current: '' })
  const [result, setResult]               = useState<DoneState | null>(null)
  const [errorMsg, setErrorMsg]           = useState('')
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const unlistenRef = useRef<(() => void) | undefined>(undefined)

  // Auto-detect the game dir on first open — and when found, run the whole
  // setup right away (no click needed); the manual fields stay as a fallback.
  useEffect(() => {
    if (!open || gameDir) return
    setDetecting(true)
    detectGameDir().then((dir) => {
      setDetecting(false)
      if (dir) {
        setGameDir(dir)
        void handleSetup(dir)
      }
    })
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to thumbnail-progress events while extracting
  useEffect(() => {
    if (!open || phase !== 'extracting') return

    let unlisten: (() => void) | undefined
    ;(async () => {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen<ProgressState>('thumbnail-progress', (event) => {
        setProgress(event.payload)
      })
      unlistenRef.current = unlisten
    })()

    return () => {
      unlisten?.()
      unlistenRef.current = undefined
    }
  }, [open, phase])

  // ── Phase 1: load Core.zip ───────────────────────────────────────────────────
  // loadFromPath() catches internally and never throws — check store state afterwards.
  const loadCoreZip = async (zipPath: string): Promise<boolean> => {
    setZipError('')
    await useCatalogStore.getState().loadFromPath(zipPath)
    const store = useCatalogStore.getState()
    if (store.error || !store.catalog) {
      setZipError(store.error ?? t('common.setupDialog.loadFailed'))
      return false
    }
    return true
  }

  // ── Phase 2: extract thumbnails ──────────────────────────────────────────────
  const runExtraction = async (dir: string): Promise<void> => {
    const catalog = useCatalogStore.getState().catalog
    if (!catalog) throw new Error('Catalog not loaded — cannot determine which icons to extract.')

    const { invoke } = await import('@tauri-apps/api/core')
    const { appLocalDataDir } = await import('@tauri-apps/api/path')

    const rawDir = await appLocalDataDir()
    const outputDir = `${rawDir.replace(/\\/g, '/').replace(/\/?$/, '/')}thumbnails`

    // Which icons to extract — shared with the manual re-run dialog.
    const requests = buildIconRequests(catalog)
    const { icons, mapObjectIcons } = requests

    const res = await invoke<{ saved: number; missing: string[] }>('extract_thumbnails', {
      gameDir: dir.trim(),
      outputDir,
      icons,
      mapObjectIcons,
    })

    recordExtractedRequests(requests)
    window.dispatchEvent(new Event('oe:thumbnails-extracted'))

    await loadThumbnailManifest()
    setResult({ saved: res.saved, missing: res.missing })
  }

  // ── Main setup handler ────────────────────────────────────────────────────────
  const handleSetup = async (detectedDir?: string) => {
    const dir = (detectedDir ?? gameDir).trim()
    if (!dir) return

    // Phase 1
    setPhase('loading-zip')
    const zipOk = await loadCoreZip(coreZipPath(dir))
    if (!zipOk) return // stay in loading-zip phase; error shown inline with fallback picker

    // Phase 2
    setPhase('extracting')
    setProgress({ done: 0, total: 0, current: '' })
    try {
      await runExtraction(dir)
      setPhase('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  // ── Fallback: user picks Core.zip manually, then continue to phase 2 ─────────
  const handlePickCoreZip = async () => {
    try {
      const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
      const picked = await openDialog({
        title: t('common.setupDialog.selectCoreZip'),
        filters: [{ name: 'Core.zip', extensions: ['zip'] }],
      })
      if (!picked || typeof picked !== 'string') return

      setZipError('')
      setPhase('loading-zip')
      const ok = await loadCoreZip(picked)
      if (!ok) return

      setPhase('extracting')
      setProgress({ done: 0, total: 0, current: '' })
      try {
        await runExtraction(gameDir.trim())
        setPhase('done')
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e))
        setPhase('error')
      }
    } catch {
      // user cancelled the picker
    }
  }

  const handleSkip = () => {
    if (dontShowAgain) localStorage.setItem('oe-setup-shown', '1')
    reset()
    onOpenChange(false)
  }

  const handleDone = () => {
    localStorage.setItem('oe-setup-shown', '1')
    reset()
    onOpenChange(false)
  }

  const reset = () => {
    setPhase('idle')
    setZipError('')
    setProgress({ done: 0, total: 0, current: '' })
    setResult(null)
    setErrorMsg('')
  }

  const isRunning = (phase === 'loading-zip' || phase === 'extracting') && !zipError
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) phase === 'done' ? handleDone() : (!isRunning && handleSkip()) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">{t('common.setupDialog.welcomeToTheScenarioEditor')}</DialogTitle>
        </DialogHeader>

        {/* ── Idle / phase-1 error ── */}
        {(phase === 'idle' || (phase === 'loading-zip' && zipError)) && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              <Trans i18nKey="common.setupDialog.intro" components={{ b: <span className="font-medium text-foreground" /> }} />
            </p>

            {/* What will happen */}
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <Trans i18nKey="common.setupDialog.step1Line" components={{ b: <span className="font-medium text-foreground" />, m: <span className="font-mono" /> }} />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <Trans i18nKey="common.setupDialog.step2Line" components={{ b: <span className="font-medium text-foreground" /> }} />
                </span>
              </div>
            </div>

            {/* Game dir input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('common.setupDialog.gameInstallationFolder')}</Label>
              <div className="flex gap-2">
                <Input
                  value={detecting ? t('shared.detecting') : gameDir}
                  onChange={(e) => setGameDir(e.target.value)}
                  placeholder={t('common.setupDialog.pathToGameInstallationFolder')}
                  disabled={detecting || isRunning}
                  className="flex-1 text-xs font-mono"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={detecting || isRunning}
                  onClick={async () => {
                    const { open: openDialog } = await import('@tauri-apps/plugin-dialog')
                    const path = await openDialog({
                      directory: true,
                      title: t('common.setupDialog.selectGameFolder'),
                    })
                    if (typeof path === 'string') setGameDir(path)
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Core.zip path error with manual-pick fallback */}
            {zipError && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <AlertDescription className="ml-2 text-xs space-y-1.5">
                  <p>
                    {t('common.setupDialog.couldNotLoadCoreZip')}
                  </p>
                  <p className="font-mono break-all opacity-70">{coreZipPath(gameDir)}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 h-6 text-xs"
                    onClick={handlePickCoreZip}
                  >
                    {t('common.setupDialog.browseForCoreZipManually')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* ── Running (no zip error) ── */}
        {isRunning && !zipError && (
          <div className="space-y-4 text-sm">
            <div className="space-y-3">
              {/* Phase 1 row */}
              <div className="flex items-center gap-3">
                {phase === 'loading-zip' ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                )}
                <span className={phase !== 'loading-zip' ? 'text-muted-foreground' : ''}>
                  {t('common.setupDialog.loadingGameData')}
                </span>
              </div>

              {/* Phase 2 row */}
              <div className="flex items-center gap-3">
                {phase === 'extracting' ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
                ) : (
                  <div className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/30" />
                )}
                <span
                  className={`min-w-0 truncate ${phase !== 'extracting' ? 'text-muted-foreground' : ''}`}
                  title={phase === 'extracting' ? progress.current || undefined : undefined}
                >
                  {phase === 'extracting' && progress.current
                    ? `Extracting: ${progress.current}`
                    : t('common.setupDialog.extractingIconThumbnails')}
                </span>
              </div>
            </div>

            {/* Progress bar — visible only during extraction */}
            {phase === 'extracting' && (
              <div className="space-y-1">
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
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && result && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {t('common.setupDialog.setupComplete')}
            </div>
            <p className="text-muted-foreground">
              <Trans i18nKey="common.setupDialog.doneSummary" count={result.saved} components={{ b: <span className="font-medium text-foreground" /> }} />
            </p>
            {result.missing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('common.setupDialog.missing', { count: result.missing.length })}
              </p>
            )}
          </div>
        )}

        {/* ── Unrecoverable error ── */}
        {phase === 'error' && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2 text-xs">{errorMsg}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="mt-2 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {/* "Don't show again" — idle and error states */}
          {!isRunning && phase !== 'done' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="setup-dont-show"
                checked={dontShowAgain}
                onCheckedChange={(v) => setDontShowAgain(!!v)}
              />
              <Label
                htmlFor="setup-dont-show"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                {t('common.setupDialog.dontShowThisAgain')}
              </Label>
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            {/* Idle */}
            {phase === 'idle' && (
              <>
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  {t('common.setupDialog.skip')}
                </Button>
                <Button onClick={() => void handleSetup()} disabled={!gameDir.trim() || detecting}>
                  {t('common.setupDialog.setUpEditor')}
                </Button>
              </>
            )}

            {/* Phase-1 error — show Skip + retry via picker */}
            {phase === 'loading-zip' && zipError && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                {t('common.setupDialog.skip')}
              </Button>
            )}

            {/* Running */}
            {isRunning && !zipError && (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {phase === 'loading-zip' ? t('common.setupDialog.loadingGameData') : t('common.thumbnailExtractDialog.extracting')}
              </Button>
            )}

            {/* Done */}
            {phase === 'done' && (
              <Button onClick={handleDone}>{t('shared.done')}</Button>
            )}

            {/* Unrecoverable error */}
            {phase === 'error' && (
              <>
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  {t('common.setupDialog.skip')}
                </Button>
                <Button onClick={reset}>{t('common.setupDialog.tryAgain')}</Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
