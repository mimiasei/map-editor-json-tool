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
import { Loader2, FolderOpen, AlertTriangle, CheckCircle2, Database, ImageIcon } from 'lucide-react'
import { useCatalogStore } from '@/store/useCatalogStore'
import { loadThumbnailManifest } from '@/hooks/useThumbnailManifest'

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
  const sep = gameDir.includes('\\') ? '\\' : '/'
  return [gameDir, 'HeroesOldenEra_Data', 'StreamingAssets', 'Core.zip'].join(sep)
}

/** Try to auto-detect the game installation directory from common Steam paths. */
async function detectGameDir(): Promise<string | null> {
  try {
    const { homeDir } = await import('@tauri-apps/api/path')
    const home = await homeDir()
    const { exists } = await import('@tauri-apps/plugin-fs')

    const candidates = [
      // Windows — Steam default (two folder-name variants seen in the wild)
      'C:/Program Files (x86)/Steam/steamapps/common/Heroes of Might and Magic Olden Era',
      'C:/Program Files (x86)/Steam/steamapps/common/Heroes of Might & Magic Olden Era',
      'C:/Program Files/Steam/steamapps/common/Heroes of Might and Magic Olden Era',
      'C:/Program Files/Steam/steamapps/common/Heroes of Might & Magic Olden Era',
      // macOS — Steam default
      `${home}/Library/Application Support/Steam/steamapps/common/Heroes of Might and Magic Olden Era`,
      `${home}/Library/Application Support/Steam/steamapps/common/Heroes of Might & Magic Olden Era`,
      // Linux — Steam default (multiple common paths)
      `${home}/.steam/steam/steamapps/common/Heroes of Might and Magic Olden Era`,
      `${home}/.steam/steam/steamapps/common/Heroes of Might & Magic Olden Era`,
      `${home}/.local/share/Steam/steamapps/common/Heroes of Might and Magic Olden Era`,
      `${home}/.local/share/Steam/steamapps/common/Heroes of Might & Magic Olden Era`,
    ]

    for (const c of candidates) {
      if (await exists(c)) return c
    }
  } catch {
    // ignore — runs on Tauri only, errors are non-fatal
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SetupDialog({ open, onOpenChange }: Props) {
  const [gameDir, setGameDir]             = useState('')
  const [detecting, setDetecting]         = useState(false)
  const [phase, setPhase]                 = useState<Phase>('idle')
  const [zipError, setZipError]           = useState('')
  const [progress, setProgress]           = useState<ProgressState>({ done: 0, total: 0, current: '' })
  const [result, setResult]               = useState<DoneState | null>(null)
  const [errorMsg, setErrorMsg]           = useState('')
  const [dontShowAgain, setDontShowAgain] = useState(false)

  const unlistenRef = useRef<(() => void) | undefined>(undefined)

  // Auto-detect game dir on first open
  useEffect(() => {
    if (!open || gameDir) return
    setDetecting(true)
    detectGameDir().then((dir) => {
      if (dir) setGameDir(dir)
      setDetecting(false)
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
      setZipError(store.error ?? 'Failed to load Core.zip')
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

    const icons: string[] = []
    const mapObjectIcons: string[] = []

    for (const h of catalog.heroes)     if (h.icon) icons.push(h.icon)
    for (const c of catalog.creatures)  if (c.icon) icons.push(c.icon)
    for (const a of catalog.artifacts)  if (a.icon) icons.push(a.icon)
    for (const s of catalog.spells)     if (s.icon) icons.push(s.icon)
    for (const s of catalog.skills)     if (s.icon) icons.push(s.icon)
    for (const b of catalog.buffs)      if (b.icon) icons.push(b.icon)
    for (const o of catalog.mapObjects) mapObjectIcons.push(o.icon ?? o.id)

    const res = await invoke<{ saved: number; missing: string[] }>('extract_thumbnails', {
      gameDir: dir.trim(),
      outputDir,
      icons: [...new Set(icons)],
      mapObjectIcons: [...new Set(mapObjectIcons)],
    })

    await loadThumbnailManifest()
    setResult({ saved: res.saved, missing: res.missing })
  }

  // ── Main setup handler ────────────────────────────────────────────────────────
  const handleSetup = async () => {
    if (!gameDir.trim()) return
    const dir = gameDir.trim()

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
        title: 'Select Core.zip',
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
          <DialogTitle className="text-lg">Welcome to the Map Editor</DialogTitle>
        </DialogHeader>

        {/* ── Idle / phase-1 error ── */}
        {(phase === 'idle' || (phase === 'loading-zip' && zipError)) && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Point the editor at your{' '}
              <span className="font-medium text-foreground">
                Heroes of Might and Magic: Olden Era
              </span>{' '}
              installation folder. The editor will load game data and extract icon
              thumbnails automatically — only needs to be done once.
            </p>

            {/* What will happen */}
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 space-y-1.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Step 1</span> — Load game data
                  from <span className="font-mono">Core.zip</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">Step 2</span> — Extract icon
                  thumbnails (stored locally, icons show in all dropdowns)
                </span>
              </div>
            </div>

            {/* Game dir input */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Game installation folder</Label>
              <div className="flex gap-2">
                <Input
                  value={detecting ? 'Detecting…' : gameDir}
                  onChange={(e) => setGameDir(e.target.value)}
                  placeholder="Path to game installation folder"
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
                      title: 'Select game installation folder',
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
                    Could not load Core.zip from the expected path. You can browse to it
                    manually.
                  </p>
                  <p className="font-mono break-all opacity-70">{coreZipPath(gameDir)}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1 h-6 text-xs"
                    onClick={handlePickCoreZip}
                  >
                    Browse for Core.zip manually
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
                  Loading game data…
                </span>
              </div>

              {/* Phase 2 row */}
              <div className="flex items-center gap-3">
                {phase === 'extracting' ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0 text-primary" />
                ) : (
                  <div className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/30" />
                )}
                <span className={phase !== 'extracting' ? 'text-muted-foreground' : ''}>
                  {phase === 'extracting' && progress.current
                    ? `Extracting: ${progress.current}`
                    : 'Extracting icon thumbnails…'}
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
                  {progress.done} / {progress.total || '?'} icons
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
              Setup complete!
            </div>
            <p className="text-muted-foreground">
              Game data loaded and{' '}
              <span className="font-medium text-foreground">
                {result.saved} icon{result.saved !== 1 ? 's' : ''}
              </span>{' '}
              extracted. Icons will appear in all dropdowns immediately.
            </p>
            {result.missing.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {result.missing.length} icon
                {result.missing.length !== 1 ? 's' : ''} were not found in the game files
                and will show as text only.
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
                Don't show this again
              </Label>
            </div>
          )}

          <div className="flex gap-2 ml-auto">
            {/* Idle */}
            {phase === 'idle' && (
              <>
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip
                </Button>
                <Button onClick={handleSetup} disabled={!gameDir.trim() || detecting}>
                  Set up editor
                </Button>
              </>
            )}

            {/* Phase-1 error — show Skip + retry via picker */}
            {phase === 'loading-zip' && zipError && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip
              </Button>
            )}

            {/* Running */}
            {isRunning && !zipError && (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {phase === 'loading-zip' ? 'Loading game data…' : 'Extracting…'}
              </Button>
            )}

            {/* Done */}
            {phase === 'done' && (
              <Button onClick={handleDone}>Done</Button>
            )}

            {/* Unrecoverable error */}
            {phase === 'error' && (
              <>
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  Skip
                </Button>
                <Button onClick={reset}>Try again</Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
