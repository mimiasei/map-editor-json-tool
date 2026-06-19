import { useRef } from 'react'
import { useStore } from 'zustand'
import { useScenarioStore } from '@/store/useScenarioStore'
import { importScenario } from '@/lib/import'
import { exportScenario, downloadJson } from '@/lib/export'
import { validateScenario } from '@/lib/validate'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
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
} from 'lucide-react'
import { useState } from 'react'

interface ToolbarProps {
  onSearchOpen?: () => void
}

export default function Toolbar({ onSearchOpen }: ToolbarProps) {
  const { scenario, isDirty, panels, setScenario, resetScenario, markClean, togglePanel } =
    useScenarioStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [validateOpen, setValidateOpen] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const [importFeedbackOpen, setImportFeedbackOpen] = useState(false)

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

  const handleNew = () => {
    if (isDirty && !confirm('You have unsaved changes. Start a new scenario anyway?')) return
    resetScenario()
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { scenario: imported, errors, warnings } = importScenario(text)

      if (imported) {
        setScenario(imported)
      }

      if (errors.length > 0 || warnings.length > 0) {
        setImportErrors(errors)
        setImportWarnings(warnings)
        setImportFeedbackOpen(true)
      }
    }
    reader.readAsText(file)
    // Reset so same file can be re-imported
    e.target.value = ''
  }

  const handleExport = () => {
    const json = exportScenario(scenario)
    downloadJson(json, 'scenario.json')
    markClean()
  }

  const validation = validateScenario(scenario)

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-12 items-center gap-2 border-b border-border bg-card px-3">
        {/* Left: app title */}
        <span className="mr-3 text-sm font-semibold text-primary tracking-wide">
          OE Scenario Editor
        </span>

        {/* Main actions */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleNew} className="gap-1.5">
                <FilePlus className="h-4 w-4" />
                New
              </Button>
            </TooltipTrigger>
            <TooltipContent>New scenario</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleImport} className="gap-1.5">
                <Upload className="h-4 w-4" />
                Import
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import JSON file</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={handleExport} className="gap-1.5">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export scenario JSON</TooltipContent>
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
        </div>

        {/* Dirty indicator */}
        {isDirty && (
          <span className="text-xs text-muted-foreground ml-1">● unsaved</span>
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

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
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
    </TooltipProvider>
  )
}
