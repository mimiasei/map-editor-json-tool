import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useScenarioStore } from '@/store/useScenarioStore'
import { importScenario } from '@/lib/import'
import { exportProjectJson } from '@/lib/export'
import { exportMapZip } from '@/lib/zip-export'
import { validateScenario } from '@/lib/validate'
import { openFile, saveFile, isTauri } from '@/lib/native-fs'
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
} from 'lucide-react'
import { useState } from 'react'

interface ToolbarProps {
  onSearchOpen?: () => void
  onTimelineOpen?: () => void
  onDiagramOpen?: () => void
  onStatsOpen?: () => void
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
  onNew,
}: ToolbarProps) {
  const {
    scenario,
    isDirty,
    panels,
    currentFileName,
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

  // ── Import (Open) ────────────────────────────────────────────────────────────
  const handleImport = async () => {
    const result = await openFile()
    if (!result) return

    const { scenario: imported, errors, warnings, mapName: mn, dialogs: dl, localization: loc } = importScenario(result.content)
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
    }
    if (errors.length > 0 || warnings.length > 0) {
      setImportErrors(errors)
      setImportWarnings(warnings)
      setImportFeedbackOpen(true)
    }
  }

  // ── Export / Save As ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    const json     = exportProjectJson(scenario, mapName, dialogs, localization)
    const savedPath = await saveFile(json, currentFileName ?? 'scenario.json')
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
      setZipError(e instanceof Error ? e.message : String(e))
      setZipErrorOpen(true)
    }
  }

  // ── Listen for actions dispatched by AppShell (native menu / keyboard) ───────
  useEffect(() => {
    const handleOpen    = () => { handleImport() }
    const handleSaveAs  = () => { handleExport() }

    window.addEventListener('oe:open',    handleOpen)
    window.addEventListener('oe:save-as', handleSaveAs)
    return () => {
      window.removeEventListener('oe:open',    handleOpen)
      window.removeEventListener('oe:save-as', handleSaveAs)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, currentFileName])

  const validation = validateScenario(scenario, { mapName, dialogs, localization })

  return (
    <>
      <header className="flex h-12 items-center gap-2 border-b border-border bg-card px-3">
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
              <Button variant="ghost" size="sm" onClick={handleImport} className="gap-1.5">
                <Upload className="h-4 w-4" />
                {isTauri() ? 'Open' : 'Import'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTauri() ? 'Open file (Ctrl+O)' : 'Import JSON file'}</TooltipContent>
          </Tooltip>

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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={() => setLocalizationDialogOpen(true)}
              >
                <Languages className="h-4 w-4" />
                Localization
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit localization tokens</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={handleExportZip}
              >
                <Package className="h-4 w-4" />
                Export ZIP
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export distributable map ZIP</TooltipContent>
          </Tooltip>
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
              <div className="flex items-center gap-2 text-sm text-green-400">
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
              <Alert key={i} className="border-yellow-600/50 bg-yellow-950/30">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
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
              <Alert key={i} className="border-yellow-600/50 bg-yellow-950/30">
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
    </>
  )
}
