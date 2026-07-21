import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useGuideStore } from '@/store/useGuideStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { importScenario } from '@/lib/import'
import { exportProjectJson } from '@/lib/export'
import { exportMapZip } from '@/lib/zip-export'
import { validateScenario } from '@/lib/validate'
import { openFile, saveFile, saveToPath, isTauri, pickCoreZip } from '@/lib/native-fs'
import { openAndLoadMapFile } from '@/lib/map-file'
import { logInfo, logWarn, logError } from '@/lib/logger'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FilePlus,
  Upload,
  Download,
  ShieldCheck,
  PanelLeft,
  PenLine,
  Braces,
  AlertTriangle,
  CheckCircle,
  Undo2,
  Redo2,
  Search,
  CalendarClock,
  Workflow,
  Languages,
  Package,
  BarChart2,
  BookOpen,
  Database,
  Loader2,
  MessageSquare,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react'
import { useState, useRef } from 'react'
import { useTheme } from '@/hooks/useTheme'
import ThumbnailExtractDialog from '@/components/common/ThumbnailExtractDialog'
import { ImageIcon } from 'lucide-react'

interface ToolbarProps {
  onSearchOpen?: () => void
  onTimelineOpen?: () => void
  onDiagramOpen?: () => void
  onStatsOpen?: () => void
  onTemplateOpen?: () => void
  onGuidesOpen?: () => void
  onDialogBrowserOpen?: () => void
  onGameDatabaseOpen?: () => void
  /** Called when the New action is triggered (button or native menu) */
  onNew?: () => void
  /** Called when the Open/Import action is triggered */
  onOpen?: () => void
  /** Called when the Save action is triggered (Ctrl+S / native menu) */
  onSave?: () => void
  /** Called when Save As is triggered */
  onSaveAs?: () => void
}

export default function Toolbar({
  onSearchOpen,
  onTimelineOpen,
  onDiagramOpen,
  onStatsOpen,
  onTemplateOpen,
  onGuidesOpen,
  onDialogBrowserOpen,
  onGameDatabaseOpen,
  onNew,
}: ToolbarProps) {
  const {
    scenario,
    isDirty,
    panels,
    currentFileName,
    currentFilePath,
    sidecarPath,
    mapName,
    dialogs,
    localization,
    setScenario,
    markClean,
    setCurrentFile,
    togglePanel,
    setLocalizationDialogOpen,
    setMapName,
    setDialogFlow,
    setLocalizationBatch,
  } = useScenarioStore()

  const [validateOpen,        setValidateOpen]        = useState(false)
  const [importErrors,        setImportErrors]        = useState<string[]>([])
  const [importWarnings,      setImportWarnings]      = useState<string[]>([])
  const [importFeedbackOpen,  setImportFeedbackOpen]  = useState(false)
  const [thumbnailDialogOpen, setThumbnailDialogOpen] = useState(false)

  const { theme, toggleTheme } = useTheme()

  // useGuideStore still needed for templateAnnotations hydration on import

  // ── Catalog ──────────────────────────────────────────────────────────────────
  const { catalog, loading: catalogLoading, error: catalogError, load: loadCatalog, loadFromFile: loadCatalogFromFile, loadFromPath: loadCatalogFromPath, clear: clearCatalog } = useCatalogStore()
  const [catalogDialogOpen, setCatalogDialogOpen] = useState(false)
  const catalogFileInputRef = useRef<HTMLInputElement | null>(null)

  const handleCatalogFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await loadCatalogFromFile(file)
    e.target.value = ''
  }

  const handleCatalogPickFile = async () => {
    if (isTauri()) {
      try {
        const path = await pickCoreZip()
        if (path) {
          await loadCatalogFromPath(path)
          return
        }
      } catch {
        // fallback to file input
      }
    }
    catalogFileInputRef.current?.click()
  }
  const canUndo = useStore(useScenarioStore.temporal, (s) => s.pastStates.length > 0)
  const canRedo = useStore(useScenarioStore.temporal, (s) => s.futureStates.length > 0)

  const handleUndo = () => {
    useScenarioStore.temporal.getState().undo()
    useScenarioStore.setState({ isDirty: true })
  }

  const handleRedo = () => {
    useScenarioStore.temporal.getState().redo()
    useScenarioStore.setState({ isDirty: true })
  }

  // ── Import (Open JSON) ────────────────────────────────────────────────────────
  const handleImport = async () => {
    // Opens a .json file only. For .map files use handleOpenMap.
    const result = await openFile()
    if (!result) return

    const { scenario: imported, errors, warnings, mapName: mn, dialogs: dl, localization: loc, annotations } = importScenario(result.content)
    if (imported) {
      setScenario(imported)
      setCurrentFile(result.path || null, result.name)
      setMapName(mn)
      // Hydrate dialogs
      for (const [id, flow] of Object.entries(dl)) {
        setDialogFlow(id, flow)
      }
      // Hydrate localization
      if (Object.keys(loc).length > 0) setLocalizationBatch(loc)
      // Hydrate template annotations
      if (Object.keys(annotations).length > 0) {
        useGuideStore.setState({ templateAnnotations: annotations })
      }
      logInfo(`Imported: ${result.name}`)
    }
    if (errors.length > 0 || warnings.length > 0) {
      logWarn(`Import of ${result.name}: ${errors.length} error(s), ${warnings.length} warning(s)`)
      setImportErrors(errors)
      setImportWarnings(warnings)
      setImportFeedbackOpen(true)
    }
  }

  // ── Open .map file ────────────────────────────────────────────────────────────
  const handleOpenMap = async () => {
    console.log('[Toolbar] handleOpenMap called')
    try {
      console.log('[Toolbar] calling openAndLoadMapFile...')
      const result = await openAndLoadMapFile()
      console.log('[Toolbar] openAndLoadMapFile returned:', result)
      if (!result) return
      logInfo(`Opened .map: ${result.name}`)
      if (result.warnings.length > 0) {
        setImportWarnings(result.warnings)
        setImportFeedbackOpen(true)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[Toolbar] openAndLoadMapFile threw:', e)
      logError(`Failed to open .map: ${msg}`)
      setImportErrors([msg])
      setImportFeedbackOpen(true)
    }
  }

  // ── Save (Ctrl+S) — writes to known path; for anchored .map projects this is
  //   the sidecar JSON. Falls back to Save As when no path is known.
  const handleSave = async () => {
    const json = exportProjectJson(scenario, mapName, dialogs, localization)
    if (isTauri() && sidecarPath) {
      await saveToPath(sidecarPath, json)
      markClean()
      return
    }
    if (isTauri() && currentFilePath) {
      await saveToPath(currentFilePath, json)
      markClean()
      return
    }
    // No known path — fall through to Save As
    await handleExport()
  }

  // ── Save As ───────────────────────────────────────────────────────────────────
  // Always shows a file-save dialog, even when a .map/sidecar path is known.
  const handleExport = async () => {
    const json     = exportProjectJson(scenario, mapName, dialogs, localization)
    const saveName = currentFileName ?? 'scenario.json'
    const savedPath = await saveFile(json, saveName)
    // In browser saveFile always downloads and returns null — still mark clean
    if (savedPath) {
      setCurrentFile(savedPath, savedPath.replace(/\\/g, '/').split('/').pop() ?? savedPath)
      markClean()
    } else if (!isTauri()) {
      markClean()
    }
    // If Tauri + user cancelled (savedPath null), leave dirty state as-is
  }

  // ── Export map ZIP ────────────────────────────────────────────────────────────
  const [zipError, setZipError] = useState<string | null>(null)
  const [zipErrorOpen, setZipErrorOpen] = useState(false)

  const handleExportZip = async () => {
    try {
      await exportMapZip(mapName, dialogs, localization)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Export ZIP failed: ${msg}`)
      setZipError(msg)
      setZipErrorOpen(true)
    }
  }

  // ── Listen for actions dispatched by AppShell (native menu / keyboard) ───────
  useEffect(() => {
    const handleOpen_    = () => { handleImport() }
    const handleOpenMap_ = () => { handleOpenMap() }
    const handleSave_    = () => { handleSave() }
    const handleSaveAs_  = () => { handleExport() }

    window.addEventListener('oe:open',      handleOpen_)
    window.addEventListener('oe:open-map',  handleOpenMap_)
    window.addEventListener('oe:save',      handleSave_)
    window.addEventListener('oe:save-as',   handleSaveAs_)
    return () => {
      window.removeEventListener('oe:open',      handleOpen_)
      window.removeEventListener('oe:open-map',  handleOpenMap_)
      window.removeEventListener('oe:save',      handleSave_)
      window.removeEventListener('oe:save-as',   handleSaveAs_)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, currentFilePath, sidecarPath, currentFileName])

  const validation = validateScenario(scenario, { mapName, dialogs, localization })

  return (
    <>
      <header className="flex h-10 items-center gap-2 border-b border-border bg-card px-2 shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
        {/* Left: app title */}
        <span className="mr-3 text-sm font-semibold text-primary tracking-wide">
          OE Scenario Editor
        </span>

        {/* Main actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onNew} className="gap-1.5">
                <FilePlus className="h-4 w-4" />
                New
              </Button>
            </TooltipTrigger>
            <TooltipContent>New scenario (Ctrl+N)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onTemplateOpen} className="gap-1.5 text-muted-foreground">
                <FilePlus className="h-4 w-4" />
                Template
              </Button>
            </TooltipTrigger>
            <TooltipContent>New from template</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleImport} className="gap-1.5">
                <Upload className="h-4 w-4" />
                {isTauri() ? 'Open' : 'Import'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTauri() ? 'Open JSON file (Ctrl+O)' : 'Import JSON file'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleOpenMap} className="gap-1.5">
                <Upload className="h-4 w-4" />
                {isTauri() ? 'Open Map' : 'Import Map'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTauri() ? 'Open .map file' : 'Import .map file'}</TooltipContent>
          </Tooltip>

          {isTauri() && currentFilePath && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleSave} className="gap-1.5" disabled={!isDirty}>
                  <Download className="h-4 w-4" />
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save (Ctrl+S)</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" />
                {isTauri() ? 'Save As' : 'Export'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTauri() ? 'Save As… (Ctrl+Shift+S)' : 'Export scenario JSON'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => setValidateOpen(true)} className="gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Validate
                <Badge
                  variant={validation.errors.length > 0 ? 'destructive' : 'secondary'}
                  className={`ml-1 h-4 px-1 text-xs${validation.errors.length === 0 && validation.warnings.length === 0 ? ' invisible' : ''}`}
                >
                  {validation.errors.length > 0 ? validation.errors.length : validation.warnings.length}
                </Badge>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Validate scenario</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleUndo}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleRedo}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onSearchOpen}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search (Ctrl+K)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onTimelineOpen}
              >
                <CalendarClock className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Event Timeline</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onDiagramOpen}
              >
                <Workflow className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Quest Flow Diagram</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onStatsOpen}
              >
                <BarChart2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scenario Statistics</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5">
                    More
                    <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Localization, Export ZIP, Guides, Game Data</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onClick={() => setTimeout(() => setLocalizationDialogOpen(true), 0)}>
                <Languages className="h-4 w-4 mr-2" />
                Localization
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleExportZip}>
                <Package className="h-4 w-4 mr-2" />
                Export ZIP
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setTimeout(() => onGuidesOpen?.(), 0)}>
                <BookOpen className="h-4 w-4 mr-2" />
                Guides
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setTimeout(() => onGameDatabaseOpen?.(), 0)}>
                <Database className="h-4 w-4 mr-2" />
                Game Database
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setTimeout(() => setCatalogDialogOpen(true), 0)}>
                {catalogLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : catalogError ? (
                  <AlertTriangle className="h-4 w-4 mr-2 text-yellow-500" />
                ) : catalog ? (
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Database className="h-4 w-4 mr-2 text-muted-foreground" />
                )}
                Game Data
              </DropdownMenuItem>

              {isTauri() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTimeout(() => setThumbnailDialogOpen(true), 0)}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Extract Thumbnails…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ── Game Data dialog (opened from More dropdown) ── */}

          {/* Hidden file input for web Core.zip selection */}
          <input
            type="file"
            accept=".zip"
            className="hidden"
            ref={catalogFileInputRef}
            onChange={handleCatalogFileSelect}
          />
        </div>

        {/* Current file name + dirty indicator */}
        {(currentFileName || isDirty) && (
          <span className="text-xs text-muted-foreground ml-1 truncate max-w-48">
            {isDirty && <span className="mr-1 text-primary">●</span>}
            {currentFileName ?? 'unsaved'}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Panel toggles */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={panels.sidebar ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => togglePanel('sidebar')}
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle sidebar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={panels.editor ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => togglePanel('editor')}
              >
                <PenLine className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle editor</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={panels.preview ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => togglePanel('preview')}
              >
                <Braces className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle JSON preview</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                aria-pressed={theme === 'dark'}
              >
                {theme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Validate dialog */}
      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Validation Results</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {validation.errors.length === 0 && validation.warnings.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                No issues found.
              </div>
            )}
            {validation.errors.map((e, i) => (
              <Alert key={i} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  <span className="font-medium text-xs opacity-70">{e.path}</span>
                  <br />
                  {e.message}
                </AlertDescription>
              </Alert>
            ))}
            {validation.warnings.map((w, i) => (
              <Alert key={i} className="border-yellow-600/50 bg-yellow-50 dark:bg-yellow-950/30">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="ml-2">
                  <span className="font-medium text-xs opacity-70">{w.path}</span>
                  <br />
                  {w.message}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import feedback dialog */}
      <Dialog open={importFeedbackOpen} onOpenChange={setImportFeedbackOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Issues</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto text-sm">
            {importErrors.map((e, i) => (
              <Alert key={i} variant="destructive">
                <AlertDescription>{e}</AlertDescription>
              </Alert>
            ))}
            {importWarnings.map((w, i) => (
              <Alert key={i} className="border-yellow-600/50 bg-yellow-50 dark:bg-yellow-950/30">
                <AlertDescription>{w}</AlertDescription>
              </Alert>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Export ZIP error dialog */}
      <Dialog open={zipErrorOpen} onOpenChange={setZipErrorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Export ZIP Failed</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">{zipError}</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>

      {/* Game Data dialog */}
      <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
        <DialogContent className="max-w-sm" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Game Data Catalog</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Status */}
            {catalogLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Building catalog from Core.zip…
              </div>
            )}
            {catalogError && !catalogLoading && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{catalogError}</AlertDescription>
              </Alert>
            )}
            {catalog && !catalogLoading && (
              <div className="text-xs space-y-1 text-muted-foreground">
                <p className="text-foreground font-medium">Loaded ✓</p>
                <p>Source: {catalog.sourceHint}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                  <span>{catalog.heroes.length} heroes</span>
                  <span>{catalog.creatures.length} creatures</span>
                  <span>{catalog.artifacts.length} artifacts</span>
                  <span>{catalog.spells.length} spells</span>
                  <span>{catalog.skills.length} skills</span>
                  <span>{catalog.buffs.length} buffs</span>
                  <span>{catalog.mapObjects.length} map objects</span>
                  <span>{catalog.dialogs.length} dialogs</span>
                </div>
              </div>
            )}
            {!catalog && !catalogLoading && !catalogError && (
              <p className="text-xs text-muted-foreground">
                Game data not loaded. Dropdowns show SIDs only.
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => { loadCatalog(); setCatalogDialogOpen(false) }} disabled={catalogLoading}>
                {catalog ? 'Rebuild' : 'Auto-detect'}
              </Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleCatalogPickFile} disabled={catalogLoading}>
                Load Core.zip…
              </Button>
              {catalog && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => clearCatalog()} disabled={catalogLoading}>
                  Clear
                </Button>
              )}
              {onDialogBrowserOpen && catalog && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { onDialogBrowserOpen(); setCatalogDialogOpen(false) }}>
                  <MessageSquare className="h-3 w-3" />
                  Browse Dialogs
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Thumbnail extract dialog (Tauri only) */}
      {isTauri() && (
        <ThumbnailExtractDialog
          open={thumbnailDialogOpen}
          onOpenChange={setThumbnailDialogOpen}
        />
      )}
    </>
  )
}
