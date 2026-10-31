import { useEffect } from 'react'
import { useStore } from 'zustand'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useGuideStore } from '@/store/useGuideStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useMapDocumentStore, commitMapIfDirty } from '@/store/useMapDocumentStore'
import { importScenario } from '@/lib/import'
import { exportProjectJson, isScenarioEmpty } from '@/lib/export'
import { exportMapZip } from '@/lib/zip-export'
import { validateScenario } from '@/lib/validate'
import { findMapValidationIssues, describeMapValidationIssue, type MapValidationIssue } from '@/lib/map-grid/map-validation'
import {
  findUnreachablePlacements, describeUnreachablePlacement, type UnreachablePlacement,
  findIsolatedPlayerStarts, describeIsolatedPlayerStart, type IsolatedPlayerStart,
} from '@/lib/map-grid/reachability-validation'
import { checkForUpdate } from '@/lib/updater'
import { buildIconRequests, newlyRequestedIcons } from '@/lib/catalog/icon-requests'
import { openFile, saveFile, saveToPath, isTauri, pickCoreZip, confirmDialog, readTextFileAt } from '@/lib/native-fs'
import { openAndLoadMapFile, openMapFromPath, commitMapWithPathPrompt } from '@/lib/map-file'
import { getRecentFiles, recordRecentFile, removeRecentFile, type RecentFile } from '@/lib/recent-files'
import NewMapDialog from '@/components/common/NewMapDialog'
import { useViewBridgeStore } from '@/store/useViewBridgeStore'
import { saveMapFile } from '@/lib/map-save'
import { logInfo, logWarn, logError } from '@/lib/logger'
import { Button } from '@/components/ui/button'
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
  Info,
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
  Palette,
  RefreshCw,
  Save,
  Wand2,
  UploadCloud,
  FileInput,
  Dices,
  BalanceScale,
  Keyboard,
  LayoutGrid,
  Layers,
  ListChecks,
  MoreHorizontal,
  ScrollText,
} from '@/components/ui/icons'
import ToolButton from '@/components/map-grid/ToolButton'
import { cn } from '@/lib/utils'
import { useState, useRef, useMemo } from 'react'
import { useTheme } from '@/hooks/useTheme'
import ThumbnailExtractDialog from '@/components/common/ThumbnailExtractDialog'
import ImportH3mDialog from '@/components/common/ImportH3mDialog'
import ThemeEditorDialog from '@/components/common/ThemeEditorDialog'
import PublishDialog from '@/components/common/PublishDialog'
import AboutDialog from '@/components/common/AboutDialog'
import HotkeysDialog from '@/components/common/HotkeysDialog'
import { useHotkeyCombo } from '@/store/useHotkeyStore'
import { comboLabel } from '@/lib/hotkeys'
import WhatsNewDialog from '@/components/common/WhatsNewDialog'
import PlayerBalancePanel, { DecorationBalanceSection } from '@/components/common/PlayerBalancePanel'
import { computeDecorationBalance, type DecorationBalance } from '@/lib/map-grid/decoration-balance'
import { computePlayerBalance, type PlayerBalance } from '@/lib/map-grid/player-balance'
import { ImageIcon } from '@/components/ui/icons'

import { useMapGridStore } from '@/store/useMapGridStore'
import { useTranslation } from 'react-i18next'

interface ToolbarProps {
  onSearchOpen?: () => void
  onTimelineOpen?: () => void
  onDiagramOpen?: () => void
  onStatsOpen?: () => void
  onTemplateOpen?: () => void
  onScriptTemplatesOpen?: () => void
  onStoryBuilderOpen?: () => void
  onGuidesOpen?: () => void
  onDialogBrowserOpen?: () => void
  onGameDatabaseOpen?: () => void
  onMapGridOpen?: () => void
  mapGridOpen?: boolean
  /** Called when the Generate Random Map action is triggered (menu item) —
   *  AppShell renders the actual pane (issue #232: full-pane view, same
   *  swap pattern as Map Grid, not a floating dialog rendered here). */
  onGenerateMapOpen?: () => void
  /** Called when the New action is triggered (button or native menu) */
  onNew?: () => void
  /** Called when the Open/Import action is triggered */
  onOpen?: () => void
  /** Called when the Save action is triggered (Ctrl+S / native menu) */
  onSave?: () => void
  /** Called when Save As is triggered */
  onSaveAs?: () => void
}

// Text tabs of the view switch; the tools themselves are ToolButtons (map-grid/ToolButton.tsx), like the Map Grid's own.
const VIEW_TAB = 'flex h-7 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40'
const VIEW_TAB_ON = 'bg-[hsl(var(--accent)/0.5)] text-foreground'
const VIEW_TAB_OFF = 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'

export default function Toolbar({
  onSearchOpen,
  onTimelineOpen,
  onDiagramOpen,
  onStatsOpen,
  onTemplateOpen,
  onScriptTemplatesOpen,
  onStoryBuilderOpen,
  onGuidesOpen,
  onDialogBrowserOpen,
  onGameDatabaseOpen,
  onMapGridOpen,
  mapGridOpen,
  onGenerateMapOpen,
  onNew,
}: ToolbarProps) {
  const { t, i18n } = useTranslation()
  const {
    scenario,
    isDirty,
    panels,
    currentFileName,
    currentFilePath,
    sidecarPath,
    mapFilePath,
    mapName,
    dialogs,
    localization,
    translations,
    customHeroes,
    customMapObjects,
    customArtifacts,
    customBuffs,
    zipDirty,
    setScenario,
    markClean,
    markZipPublished,
    setCurrentFile,
    togglePanel,
    setLocalizationDialogOpen,
    setMapName,
    setDialogFlow,
    setLocalizationBatch,
    setTranslations,
    setCustomHero,
    setCustomMapObject,
    setCustomArtifact,
    setCustomBuff,
  } = useScenarioStore()

  const mapIsDirty = useMapDocumentStore((s) => s.mapIsDirty)

  const [validateOpen,        setValidateOpen]        = useState(false)
  // Same on-demand rule as the placement check: scored when the dialog opens, from the loaded map. The score is the one the random map
  // generator itself uses to pick and warn (computePlayerBalance).
  const [fairnessOpen,        setFairnessOpen]        = useState(false)
  // A boolean selector, so map edits don't re-render the toolbar.
  const hasMap = useMapContextStore((s) => !!s.context)
  const rmgOpen = useViewBridgeStore((s) => s.rmgOpen)
  const goToQuests = useViewBridgeStore((s) => s.goToQuests)
  const viewMapCombo = useHotkeyCombo('viewMap')
  const viewQuestsCombo = useHotkeyCombo('viewQuests')
  const [hotkeysOpen, setHotkeysOpen] = useState(false)
  // A pick started from the quests editor owns the view switch until it resolves or is cancelled.
  const pickPending = useViewBridgeStore((s) => s.pendingPick !== null)
  const mapView = !!mapGridOpen || rmgOpen
  const [fairness, setFairness] = useState<PlayerBalance | null>(null)
  const [decorationBalance, setDecorationBalance] = useState<DecorationBalance | null>(null)
  const [scenarioSectionOpen, setScenarioSectionOpen] = useState(true)
  const [placementSectionOpen, setPlacementSectionOpen] = useState(true)
  // On-demand only (per issue: no continuous/auto-validation while editing)
  // — (re)computed just before the Validate dialog opens, never on every
  // render like the scenario `validation` below. null means either "not
  // checked yet this session" or "no map currently loaded".
  const [mapPlacementCheck, setMapPlacementCheck] = useState<{ issues: MapValidationIssue[]; unreachable: UnreachablePlacement[]; isolated: IsolatedPlayerStart[] } | null>(null)
  const [placementAutoFixing, setPlacementAutoFixing] = useState(false)
  const [importErrors,        setImportErrors]        = useState<string[]>([])
  const [importWarnings,      setImportWarnings]      = useState<string[]>([])
  const [importFeedbackOpen,  setImportFeedbackOpen]  = useState(false)
  const [thumbnailDialogOpen, setThumbnailDialogOpen] = useState(false)
  const [themeEditorOpen,     setThemeEditorOpen]     = useState(false)
  const [publishOpen,         setPublishOpen]         = useState(false)
  const [updateChecking,      setUpdateChecking]      = useState(false)
  const [updateMessage,       setUpdateMessage]       = useState<string | null>(null)
  const [aboutOpen,           setAboutOpen]           = useState(false)
  const [whatsNewOpen,        setWhatsNewOpen]        = useState(false)
  const [newMapOpen,          setNewMapOpen]          = useState(false)
  const [importH3mOpen,       setImportH3mOpen]       = useState(false)

  const selectNode = useMapGridStore((s) => s.selectNode)
  const requestMapGridFocus = useMapGridStore((s) => s.requestFocus)

  const focusOnTile = (x: number, z: number, node: number) => {
    onMapGridOpen?.()       // prop Toolbar already receives from AppShell
    selectNode(node)
    requestMapGridFocus(x, z)
  }

  // Generate Random Map now renders as a full pane from AppShell (issue
  // #232), not a dialog here — its own warnings arrive via this one-shot
  // store field instead of a direct callback, feeding the same import-
  // feedback dialog New Map/Import H3/Open already use below.
  const pendingGeneratedWarnings = useViewBridgeStore((s) => s.pendingGeneratedWarnings)
  const clearGeneratedWarnings = useViewBridgeStore((s) => s.clearGeneratedWarnings)
  useEffect(() => {
    if (!pendingGeneratedWarnings) return
    setImportWarnings(pendingGeneratedWarnings)
    setImportFeedbackOpen(true)
    clearGeneratedWarnings()
  }, [pendingGeneratedWarnings, clearGeneratedWarnings])

  // ── Manual update check ──────────────────────────────────────────────────────
  // The startup check is silent by design, so this is the only way to learn that
  // you're already current — or to re-check after dismissing the banner.
  const handleCheckForUpdates = async () => {
    setUpdateChecking(true)
    setUpdateMessage(null)
    try {
      const outcome = await checkForUpdate()
      switch (outcome.status) {
        case 'update':
          // AppShell owns the banner and dialog — hand the result over.
          window.dispatchEvent(new CustomEvent('oe:update-found', { detail: outcome.update }))
          break
        case 'current':
          setUpdateMessage(`You're on the latest version (${outcome.currentVersion}).`)
          break
        case 'unsupported':
          setUpdateMessage(
            import.meta.env.DEV
              ? t('layout.toolbar.updatesDisabledDev')
              : t('layout.toolbar.updatesDesktopOnly'),
          )
          break
        case 'error':
          setUpdateMessage(`Could not check for updates: ${outcome.message}`)
          break
      }
    } finally {
      setUpdateChecking(false)
    }
  }

  const { theme, toggleTheme } = useTheme()

  // useGuideStore still needed for templateAnnotations hydration on import

  // ── Catalog ──────────────────────────────────────────────────────────────────
  const { catalog, loading: catalogLoading, error: catalogError, load: loadCatalog, loadFromFile: loadCatalogFromFile, loadFromPath: loadCatalogFromPath, clear: clearCatalog } = useCatalogStore()

  // Same source as the artwork banner in AppShell, so the two cannot disagree.
  const pendingIcons = useMemo(
    () => (isTauri() && catalog ? newlyRequestedIcons(buildIconRequests(catalog)).length : 0),
    [catalog],
  )
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
    if (result) loadImportedJson(result)
  }

  const loadImportedJson = (result: { name: string; path: string; content: string }) => {
    const { scenario: imported, errors, warnings, mapName: mn, dialogs: dl, localization: loc, translations: tr, customHeroes: ch, customMapObjects: cmo, customArtifacts: ca, customBuffs: cb, annotations } = importScenario(result.content)
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
      // Hydrate extra languages (absent in files saved before multi-language support)
      setTranslations(tr)
      // Hydrate custom hero identities (absent in files saved before issue #139)
      for (const [heroSid, def] of Object.entries(ch)) setCustomHero(heroSid, def)
      // Hydrate custom map object identities (absent in files saved before issue #146)
      for (const [id, def] of Object.entries(cmo)) setCustomMapObject(id, def)
      // Hydrate custom artifact identities (absent in files saved before issue #150)
      for (const [id, def] of Object.entries(ca)) setCustomArtifact(id, def)
      // Hydrate custom buff identities (absent in files saved before issue #165)
      for (const [id, def] of Object.entries(cb)) setCustomBuff(id, def)
      // Hydrate template annotations
      if (Object.keys(annotations).length > 0) {
        useGuideStore.setState({ templateAnnotations: annotations })
      }
      logInfo(`Imported: ${result.name}`)
      if (result.path) recordRecentFile(result.path, 'json')
    }
    if (errors.length > 0 || warnings.length > 0) {
      logWarn(`Import of ${result.name}: ${errors.length} error(s), ${warnings.length} warning(s)`)
      setImportErrors(errors)
      setImportWarnings(warnings)
      setImportFeedbackOpen(true)
    }
  }

  // ── New Map — same unsaved-changes guard as AppShell's own "New" (scenario-
  // only) handler, since creating a new map discards the currently loaded
  // one immediately once the user actually hits "Create" in the dialog
  // (NewMapDialog → createNewMap → loadParsedMapFile, unconditionally).
  const handleNewMapClick = async () => {
    if (isDirty || mapIsDirty) {
      const ok = await confirmDialog(
        t('layout.toolbar.confirmNewMap'),
        t('layout.toolbar.confirmNewMapTitle'),
      )
      if (!ok) return
    }
    setNewMapOpen(true)
  }

  // ── Import H3 Map — same unsaved-changes guard as New Map above, since a
  // successful import discards the currently loaded map immediately (loads
  // the converted result via loadParsedMapFile, unconditionally — see
  // import-h3m-file.ts).
  const handleImportH3mClick = async () => {
    if (isDirty || mapIsDirty) {
      const ok = await confirmDialog(
        t('layout.toolbar.confirmImportH3'),
        t('layout.toolbar.confirmImportH3Title'),
      )
      if (!ok) return
    }
    setImportH3mOpen(true)
  }

  // ── Generate Random Map — same unsaved-changes guard as New Map/Import H3
  // Map above, since a successful generation discards the currently loaded
  // map immediately (loads the generated result via loadParsedMapFile,
  // unconditionally — see generate-map-file.ts).
  const handleGenerateMapClick = async () => {
    if (isDirty || mapIsDirty) {
      const ok = await confirmDialog(
        t('layout.toolbar.confirmGenerate'),
        t('layout.toolbar.confirmGenerateTitle'),
      )
      if (!ok) return
    }
    onGenerateMapOpen?.()
  }

  // ── File > Open Recent... — same unsaved-changes guard as New Map above, since opening replaces what is loaded.
  const handleOpenRecentEntry = async (entry: RecentFile) => {
    if (isDirty || mapIsDirty) {
      const ok = await confirmDialog(t('layout.toolbar.confirmOpenRecent', { name: entry.name }), t('layout.toolbar.confirmOpenRecentTitle'))
      if (!ok) return
    }
    try {
      if (entry.kind === 'map') {
        const result = await openMapFromPath(entry.path)
        if (result.warnings.length > 0) {
          setImportWarnings(result.warnings)
          setImportFeedbackOpen(true)
        }
        onMapGridOpen?.()   // a .map opens in the Map Grid, its main workspace
      } else {
        const content = await readTextFileAt(entry.path)
        if (content === null) throw new Error(`Could not read ${entry.path}. It may have been moved or deleted.`)
        loadImportedJson({ name: entry.name, path: entry.path, content })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Failed to open recent file: ${msg}`)
      // The menu can't offer an X per entry, so a file that is gone drops off the list when it fails to open.
      removeRecentFile(entry.path)
      setImportErrors([msg])
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
      onMapGridOpen?.()   // a .map opens in the Map Grid, its main workspace
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[Toolbar] openAndLoadMapFile threw:', e)
      logError(`Failed to open .map: ${msg}`)
      setImportErrors([msg])
      setImportFeedbackOpen(true)
    }
  }

  // ── Save (Ctrl+S) — writes to known path; for anchored .map projects this is
  //   the sidecar JSON. Falls back to Save As when no path is known. Also
  //   commits any pending Map Grid edits (issue #195 follow-up: Save is
  //   unified — one action for both halves, matching how the .map side no
  //   longer has its own separate save trigger).
  const handleSave = async () => {
    await commitMapIfDirty(mapFilePath)
    if (isScenarioEmpty(scenario, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)) {
      markClean()
      return
    }
    const json = exportProjectJson(scenario, mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)
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
  // Always shows a file-save dialog, even when a .map/sidecar path is known —
  // commitMapWithPathPrompt({ forceNewPath: true }) (map-file.ts) is what
  // makes the .map half always prompt; plain Save calls the same function
  // with no options, which only prompts the very first time (a never-saved
  // map, e.g. one just created via New Map).
  const handleExport = async () => {
    if ((await commitMapWithPathPrompt({ forceNewPath: true })) !== 'saved') return // user cancelled the prompt — abort the whole Save As
    if (isScenarioEmpty(scenario, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)) {
      markClean()
      return
    }
    const json = exportProjectJson(scenario, mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)
    // commitMapWithPathPrompt (map-file.ts) already derived and stored the
    // sidecar path alongside whatever .map path the user just picked in the
    // ONE dialog above — write straight there instead of prompting a SECOND
    // save dialog (which used to default to the .map's own file name,
    // producing a confusing "<map name>.map.json" once saved). Read fresh
    // from the store rather than the render-time `sidecarPath` closure,
    // since that prompt just updated it a moment ago.
    const freshSidecarPath = useScenarioStore.getState().sidecarPath
    if (isTauri() && freshSidecarPath) {
      await saveToPath(freshSidecarPath, json)
      setCurrentFile(freshSidecarPath, freshSidecarPath.replace(/\\/g, '/').split('/').pop() ?? freshSidecarPath)
      markClean()
      return
    }
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
      const langs = await exportMapZip(mapName, dialogs, localization, translations, customHeroes, customMapObjects, customArtifacts, customBuffs)
      // Name the language files that landed — a missing translation used to be silent.
      if (langs) {
        logInfo(`Exported ZIP: ${langs.length} language file(s) — ${langs.join(', ')}`)
      }
      markZipPublished()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Export ZIP failed: ${msg}`)
      setZipError(msg)
      setZipErrorOpen(true)
    }
  }

  // ── Re-save map (no changes) — desktop test feature, issue #120 ─────────────
  // The control experiment for whether the game rejects a map this tool has
  // repacked: same write path as an entity SID rename, zero semantic edits.
  const [mapResaving, setMapResaving] = useState(false)
  const [mapResaveResult, setMapResaveResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleResaveMap = async () => {
    if (!mapFilePath) return
    setMapResaving(true)
    try {
      const result = await saveMapFile(mapFilePath)
      logInfo(`Re-saved .map unchanged: ${mapFilePath} (backup ${result.backupCreated ? 'created' : 'already existed'} at ${result.backupPath})`)
      setMapResaveResult({
        ok: true,
        message: t(result.backupCreated ? 'layout.toolbar.resaved' : 'layout.toolbar.resavedBackupKept', { bytes: result.bytesWritten.toLocaleString(i18n.language), path: result.backupPath }),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      logError(`Re-save .map failed: ${msg}`)
      setMapResaveResult({ ok: false, message: msg })
    } finally {
      setMapResaving(false)
    }
  }

  // ── Listen for actions dispatched by AppShell (native menu / keyboard) ───────
  //
  // These handlers read translations, dialogs, localization and mapName, and used to be
  // captured by an effect keyed on [scenario, currentFilePath, sidecarPath,
  // currentFileName]. Anything changed without also touching one of those — adding a
  // language, editing a dialog, renaming the map — left the registered listener holding
  // an older render's values, so Save As silently wrote stale data. That is how a French
  // translation could vanish from a saved project.
  //
  // Dispatching through a ref that is refreshed on every render removes the dependency
  // array as a correctness requirement, rather than listing four more names that the next
  // new field would miss again.
  const handlersRef = useRef({ handleNewMapClick, handleGenerateMapClick, handleImport, handleOpenMap, handleImportH3mClick, handleSave, handleExport, handleCheckForUpdates, handleOpenRecentEntry })
  handlersRef.current = { handleNewMapClick, handleGenerateMapClick, handleImport, handleOpenMap, handleImportH3mClick, handleSave, handleExport, handleCheckForUpdates, handleOpenRecentEntry }

  useEffect(() => {
    const onOpen      = () => { handlersRef.current.handleImport() }
    const onOpenMap   = () => { handlersRef.current.handleOpenMap() }
    const onNewMap    = () => { void handlersRef.current.handleNewMapClick() }
    const onRandomMap = () => { void handlersRef.current.handleGenerateMapClick() }
    const onHotkeys    = () => { setHotkeysOpen(true) }
    const onOpenRecentFile = (e: Event) => {
      const entry = getRecentFiles().find((f) => f.path === (e as CustomEvent<string>).detail)
      if (entry) void handlersRef.current.handleOpenRecentEntry(entry)
    }
    const onImportH3m = () => { void handlersRef.current.handleImportH3mClick() }
    const onSave      = () => { handlersRef.current.handleSave() }
    const onSaveAs    = () => { handlersRef.current.handleExport() }

    const onAbout   = () => { setAboutOpen(true) }
    const onWhatsNew = () => { setWhatsNewOpen(true) }
    const onUpdates = () => { void handlersRef.current.handleCheckForUpdates() }

    window.addEventListener('oe:about',         onAbout)
    window.addEventListener('oe:whats-new',     onWhatsNew)
    window.addEventListener('oe:check-updates', onUpdates)
    window.addEventListener('oe:open',       onOpen)
    window.addEventListener('oe:open-map',   onOpenMap)
    window.addEventListener('oe:new-map',    onNewMap)
    window.addEventListener('oe:random-map', onRandomMap)
    window.addEventListener('oe:hotkeys',    onHotkeys)
    window.addEventListener('oe:open-recent-file', onOpenRecentFile)
    window.addEventListener('oe:import-h3m', onImportH3m)
    window.addEventListener('oe:save',       onSave)
    window.addEventListener('oe:save-as',    onSaveAs)
    return () => {
      window.removeEventListener('oe:about',         onAbout)
      window.removeEventListener('oe:whats-new',     onWhatsNew)
      window.removeEventListener('oe:check-updates', onUpdates)
      window.removeEventListener('oe:open',       onOpen)
      window.removeEventListener('oe:open-map',   onOpenMap)
      window.removeEventListener('oe:new-map',    onNewMap)
      window.removeEventListener('oe:random-map', onRandomMap)
      window.removeEventListener('oe:hotkeys',    onHotkeys)
      window.removeEventListener('oe:open-recent-file', onOpenRecentFile)
      window.removeEventListener('oe:import-h3m', onImportH3m)
      window.removeEventListener('oe:save',       onSave)
      window.removeEventListener('oe:save-as',    onSaveAs)
    }
  }, [])

  // Base-game speaker SIDs, so built-in labels aren't flagged as missing text
  const knownGameSids = useMemo(
    () => new Set((catalog?.speakerTitles ?? []).map((t) => t.sid)),
    [catalog],
  )
  const validation = validateScenario(scenario, { mapName, dialogs, localization, knownGameSids })

  // Map placement/reachability check — deliberately NOT run on every render
  // like `validation` above (a full reachability flood-fill/BFS isn't cheap
  // on a large map, and continuously re-validating while the user is mid-edit
  // would be noisy besides) — only recomputed right before the dialog opens.
  const handleOpenFairness = () => {
    const context = useMapContextStore.getState().context
    setFairness(context ? computePlayerBalance(context, catalog) : null)
    setDecorationBalance(context ? computeDecorationBalance(context, catalog) : null)
    setFairnessOpen(true)
  }

  const handleOpenValidate = () => {
    const context = useMapContextStore.getState().context
    setMapPlacementCheck(
      context
        ? {
            issues: findMapValidationIssues(context, catalog),
            unreachable: findUnreachablePlacements(context, catalog),
            isolated: findIsolatedPlayerStarts(context, catalog),
          }
        : null,
    )
    setValidateOpen(true)
  }

  const handleAutoFixPlacement = () => {
    setPlacementAutoFixing(true)
    try {
      const result = useMapDocumentStore.getState().autoFixMapPlacementIssues()
      const context = useMapContextStore.getState().context
      setMapPlacementCheck({
        issues: result.remainingIssues,
        unreachable: result.remainingUnreachable,
        isolated: context ? findIsolatedPlayerStarts(context, catalog) : [],
      })
      const remaining = result.remainingIssues.length + result.remainingUnreachable.length
      logInfo(`Auto-fixed ${result.fixedCount} map placement issue(s)${remaining > 0 ? ` — ${remaining} still unresolved` : ''}.`)
    } catch (e) {
      logError(`Map placement auto-fix failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPlacementAutoFixing(false)
    }
  }

  return (
    <>
      <header className="flex h-11 items-center gap-1 border-b border-border bg-card px-2 shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
        {/* View switch: the Map Grid (and the random map view) versus the quests editor. Each view has its own tools below. */}
        <div className="flex items-center gap-1" role="group" aria-label={t('layout.toolbar.views')}>
          <button
            type="button"
            disabled={pickPending}
            aria-pressed={mapView}
            onClick={() => onMapGridOpen?.()}
            title={viewMapCombo ? comboLabel(viewMapCombo) : undefined}
            className={cn(VIEW_TAB, mapView ? VIEW_TAB_ON : VIEW_TAB_OFF)}
          >
            <LayoutGrid className="h-4 w-4" />
            {t('layout.toolbar.viewMap')}
          </button>
          <button
            type="button"
            disabled={pickPending}
            aria-pressed={!mapView}
            onClick={goToQuests}
            title={viewQuestsCombo ? comboLabel(viewQuestsCombo) : undefined}
            className={cn(VIEW_TAB, !mapView ? VIEW_TAB_ON : VIEW_TAB_OFF)}
          >
            <ListChecks className="h-4 w-4" />
            {t('layout.toolbar.viewQuests')}
          </button>
        </div>

        <div className="mx-1.5 h-5 w-px bg-border" />

        {/* Tools of the active view */}
        <div className="flex items-center gap-0.5">
          {mapView ? (
            <>
          {isTauri() && (
            <ToolButton
              icon={<FilePlus className="h-3.5 w-3.5" />}
              label={t('layout.toolbar.newMap')}
              title={t('layout.toolbar.createANewBlankMap')}
              onClick={handleNewMapClick}
            />
          )}
          {!isTauri() && (
            <ToolButton
              icon={<Upload className="h-3.5 w-3.5" />}
              label={t('layout.toolbar.importMap')}
              title={t('layout.toolbar.importMapFile')}
              onClick={handleOpenMap}
            />
          )}
          <ToolButton
            icon={<Dices className="h-3.5 w-3.5" />}
            label={t('common.generateRandomMapDialog.generateRandomMap')}
            onClick={handleGenerateMapClick}
          />
          {hasMap && (
            <ToolButton
              icon={<BalanceScale className="h-3.5 w-3.5" />}
              label={t('layout.toolbar.fairness')}
              title={t('layout.toolbar.checkHowEvenTheMap')}
              onClick={handleOpenFairness}
            />
          )}
          </>
          ) : (
            <>
          {!isTauri() && (
            <ToolButton
              icon={<FilePlus className="h-3.5 w-3.5" />}
              label={t('layout.toolbar.new')}
              title={t('layout.toolbar.newScenarioCtrlN')}
              onClick={onNew}
            />
          )}
          <ToolButton
            icon={<Layers className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.template')}
            title={t('layout.toolbar.newFromTemplate')}
            onClick={onTemplateOpen}
          />
          <ToolButton
            icon={<Wand2 className="h-3.5 w-3.5" />}
            label={t('tree.scriptTemplateDialog.scriptTemplates')}
            title={t('layout.toolbar.generateScriptingForClassicHoMM3')}
            onClick={onScriptTemplatesOpen}
          />
          <ToolButton
            icon={<ScrollText className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.story')}
            title={t('layout.toolbar.addAReadyMadeOr')}
            onClick={onStoryBuilderOpen}
          />
          {!isTauri() && (
            <ToolButton
              icon={<Upload className="h-3.5 w-3.5" />}
              label={t('common.themeEditorDialog.import')}
              title={t('layout.toolbar.importJSONFile')}
              onClick={handleImport}
            />
          )}
          {isTauri() && (
            <ToolButton
              icon={
                <span className="relative">
                  <UploadCloud className="h-3.5 w-3.5" />
                  {zipDirty && <span className="absolute -right-1.5 -top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </span>
              }
              label={t('layout.toolbar.publish')}
              title={zipDirty ? t('layout.toolbar.publishMapYouHaveChanges') : t('common.publishDialog.publishMap')}
              onClick={() => setPublishOpen(true)}
            />
          )}
          <ToolButton
            icon={<CalendarClock className="h-3.5 w-3.5" />}
            label={t('common.timelineDialog.eventTimeline')}
            onClick={onTimelineOpen}
          />
          <ToolButton
            icon={<Workflow className="h-3.5 w-3.5" />}
            label={t('common.questFlowDialog.questFlowDiagram')}
            onClick={onDiagramOpen}
          />
          </>
          )}
        </div>

        <div className="mx-1.5 h-5 w-px bg-border" />

        {/* Tools that work in both views */}
        <div className="flex items-center gap-0.5">
          <ToolButton
            icon={<Undo2 className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.undoCtrlZ')}
            onClick={handleUndo}
            disabled={!canUndo}
          />
          <ToolButton
            icon={<Redo2 className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.redoCtrlShiftZ')}
            onClick={handleRedo}
            disabled={!canRedo}
          />
          <ToolButton
            icon={
              <span className="relative">
                <ShieldCheck className="h-3.5 w-3.5" />
                {/* Sits on the icon's corner, so it adds no width. */}
                {(validation.errors.length > 0 || validation.warnings.length > 0) && (
                  <Badge
                    variant={validation.errors.length > 0 ? 'destructive' : 'secondary'}
                    className="absolute -right-3 -top-2 h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
                  >
                    {validation.errors.length > 0 ? validation.errors.length : validation.warnings.length}
                  </Badge>
                )}
              </span>
            }
            label={t('layout.toolbar.validate')}
            title={t('layout.toolbar.validateScenario')}
            onClick={handleOpenValidate}
          />
          {!isTauri() && (
            <ToolButton
              icon={<Save className="h-3.5 w-3.5" />}
              label={t('layout.toolbar.saveAs')}
              title={t('layout.toolbar.saveAsTitle')}
              onClick={handleExport}
            />
          )}
          <ToolButton
            icon={<BookOpen className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.guides')}
            onClick={onGuidesOpen}
          />
          <ToolButton
            icon={<Database className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.gameDatabase')}
            onClick={onGameDatabaseOpen}
          />
          <ToolButton
            icon={<Search className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.searchCtrlK')}
            onClick={onSearchOpen}
          />
          <ToolButton
            icon={<BarChart2 className="h-3.5 w-3.5" />}
            label={t('layout.toolbar.statistics')}
            onClick={onStatsOpen}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolButton
                icon={<MoreHorizontal className="h-3.5 w-3.5" />}
                label={t('layout.toolbar.menu.more')}
                title={t('layout.toolbar.localizationExportZIPGameData')}
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onClick={() => setTimeout(() => setLocalizationDialogOpen(true), 0)}>
                <Languages className="h-4 w-4 mr-2" />
                {t('layout.toolbar.menu.localization')}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleExportZip}>
                <Package className="h-4 w-4 mr-2" />
                {t('layout.toolbar.menu.exportZip')}
              </DropdownMenuItem>

              {/* Desktop only test feature (issue #120) — needs a .map file loaded */}
              {isTauri() && mapFilePath && (
                <DropdownMenuItem onClick={handleResaveMap} disabled={mapResaving}>
                  {mapResaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {t('layout.toolbar.menu.resaveMap')}
                </DropdownMenuItem>
              )}

              {isTauri() && (
                <DropdownMenuItem onClick={handleCheckForUpdates} disabled={updateChecking}>
                  {updateChecking ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t('layout.toolbar.menu.checkForUpdates')}
                </DropdownMenuItem>
              )}

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
                {t('layout.toolbar.menu.gameData')}
              </DropdownMenuItem>

              {isTauri() && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTimeout(() => setThumbnailDialogOpen(true), 0)}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {t('layout.toolbar.menu.extractThumbnails')}
                    {/* Stays visible after the banner is dismissed, so the cue remains
                        findable without nagging. */}
                    {pendingIcons > 0 && (
                      <Badge variant="secondary" className="ml-auto h-4 px-1 text-[10px] text-amber-600">
                        {pendingIcons}
                      </Badge>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimeout(() => window.dispatchEvent(new Event('oe:render-objects-open')), 0)}>
                    <ImageIcon className="h-4 w-4 mr-2" />
                    {t('layout.toolbar.menu.renderObjectImages')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTimeout(handleImportH3mClick, 0)}>
                    <FileInput className="h-4 w-4 mr-2" />
                    {t('layout.toolbar.menu.importH3Map')}
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setTimeout(() => setHotkeysOpen(true), 0)}>
                <Keyboard className="h-4 w-4 mr-2" />
                {t('hotkeys.title')}
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setTimeout(() => setAboutOpen(true), 0)}>
                <Info className="h-4 w-4 mr-2" />
                {t('common.aboutDialog.about')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Hidden file input for web Core.zip selection */}
          <input
            type="file"
            accept=".zip"
            className="hidden"
            ref={catalogFileInputRef}
            onChange={handleCatalogFileSelect}
          />
        </div>

        {/* Current file name + dirty indicator — covers both the scenario
            JSON (isDirty) and any unsaved Map Grid edit (mapIsDirty, issue
            #195 follow-up: Save is unified, so the indicator is too). */}
        {(currentFileName || isDirty || mapIsDirty) && (
          <span className="text-xs text-muted-foreground ml-1 truncate max-w-48">
            {(isDirty || mapIsDirty) && <span className="mr-1 text-primary">●</span>}
            {currentFileName ?? t('layout.toolbar.unsaved')}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Panel toggles (the quests view's three columns) and the theme controls */}
        <div className="flex items-center gap-0.5">
          {!mapView && (
            <>
              <ToolButton icon={<PanelLeft className="h-3.5 w-3.5" />} label={t('layout.toolbar.toggleSidebar')} active={panels.sidebar} onClick={() => togglePanel('sidebar')} />
              <ToolButton icon={<PenLine className="h-3.5 w-3.5" />} label={t('layout.toolbar.toggleEditor')} active={panels.editor} onClick={() => togglePanel('editor')} />
              <ToolButton icon={<Braces className="h-3.5 w-3.5" />} label={t('layout.toolbar.toggleJSONPreview')} active={panels.preview} onClick={() => togglePanel('preview')} />
            </>
          )}
          <ToolButton
            icon={theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            label={theme === 'dark' ? t('layout.toolbar.switchToLightTheme') : t('layout.toolbar.switchToDarkTheme')}
            aria-pressed={theme === 'dark'}
            onClick={toggleTheme}
          />
          <ToolButton icon={<Palette className="h-3.5 w-3.5" />} label={t('layout.toolbar.themeEditor')} onClick={() => setThemeEditorOpen(true)} />
        </div>
      </header>

      {/* Fairness dialog */}
      <Dialog open={fairnessOpen} onOpenChange={setFairnessOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('layout.toolbar.mapFairness')}</DialogTitle>
          </DialogHeader>
          <PlayerBalancePanel balance={fairness} />
          <DecorationBalanceSection decoration={decorationBalance} />
          <p className="text-xs text-muted-foreground">
            {t('layout.toolbar.theSameScoreTheRandom')}
          </p>
        </DialogContent>
      </Dialog>

      {/* Validate dialog */}
      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('layout.toolbar.validationResults')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground w-full"
              onClick={() => setScenarioSectionOpen((v) => !v)}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${scenarioSectionOpen ? '' : '-rotate-90'}`} />
              {t('layout.toolbar.scenario')}
            </button>
            {scenarioSectionOpen && (
                <>
                {validation.errors.length === 0 && validation.warnings.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    {t('layout.toolbar.noIssuesFound')}
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
              </>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                type="button"
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground w-full"
                onClick={() => setPlacementSectionOpen((v) => !v)}
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${placementSectionOpen ? '' : '-rotate-90'}`} />
                {t('layout.toolbar.mapPlacementReachability')}
              </button>
              {mapPlacementCheck && (mapPlacementCheck.issues.length > 0 || mapPlacementCheck.unreachable.length > 0) && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleAutoFixPlacement} disabled={placementAutoFixing}>
                  {placementAutoFixing ? t('layout.toolbar.fixing') : t('common.mapValidationErrorDialog.autoFix')}
                </Button>
              )}
            </div>
            {placementSectionOpen && (
              <>
            {!mapPlacementCheck && (
              <p className="text-xs text-muted-foreground">{t('layout.toolbar.openAMapFileTo')}</p>
            )}
            {mapPlacementCheck
              && mapPlacementCheck.issues.length === 0
              && mapPlacementCheck.unreachable.length === 0
              && mapPlacementCheck.isolated.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {t('layout.toolbar.noMapPlacementIssuesFound')}
              </div>
            )}
            {mapPlacementCheck?.issues.map((issue, i) => (
              <Alert key={`bounds-entrance-${i}`} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="ml-2">{describeMapValidationIssue(issue)}</AlertDescription>
              </Alert>
            ))}
            {mapPlacementCheck?.unreachable.map((issue, i) => (
              <Alert key={`unreachable-${i}`}
                     className="border-yellow-600/50 bg-yellow-50 dark:bg-yellow-950/30 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/40"
                     onClick={() => focusOnTile(issue.x, issue.z, issue.node)}
              >
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="ml-2">{describeUnreachablePlacement(issue)}</AlertDescription>
              </Alert>
            ))}
              {mapPlacementCheck && mapPlacementCheck.isolated.length > 0 && (
                  <>
                      <p className="text-xs text-muted-foreground">{t('layout.toolbar.notAutoFixableReconnectingIsolated')}</p>
                      {mapPlacementCheck.isolated.map((issue, i) => (
                          <Alert
                              key={`isolated-${i}`}
                              variant="destructive"
                              className="cursor-pointer hover:opacity-80"
                              onClick={() => focusOnTile(issue.x, issue.z, issue.node)}
                          >
                              <AlertTriangle className="h-4 w-4" />
                              <AlertDescription className="ml-2">{describeIsolatedPlayerStart(issue)}</AlertDescription>
                          </Alert>
                      ))}
                  </>
              )}
            </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Import feedback dialog */}
      <Dialog open={importFeedbackOpen} onOpenChange={setImportFeedbackOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('layout.toolbar.importIssues')}</DialogTitle>
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
            <DialogTitle>{t('layout.toolbar.exportZIPFailed')}</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2">{zipError}</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>

      {/* Re-save map result dialog (issue #120 test feature) */}
      <Dialog open={mapResaveResult !== null} onOpenChange={(o) => { if (!o) setMapResaveResult(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{mapResaveResult?.ok ? t('layout.toolbar.mapReSaved') : t('layout.toolbar.reSaveFailed')}</DialogTitle>
          </DialogHeader>
          <Alert variant={mapResaveResult?.ok ? undefined : 'destructive'} className={mapResaveResult?.ok ? 'border-green-600/50 bg-green-50 dark:bg-green-950/30' : undefined}>
            {mapResaveResult?.ok ? (
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-500" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription className="ml-2 whitespace-pre-line">{mapResaveResult?.message}</AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>

      {/* Game Data dialog */}
      <Dialog open={catalogDialogOpen} onOpenChange={setCatalogDialogOpen}>
        <DialogContent className="max-w-sm" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('layout.toolbar.gameDataCatalog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Status */}
            {catalogLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('layout.toolbar.buildingCatalogFromCoreZip')}
              </div>
            )}
            {catalogError && !catalogLoading && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-xs">{catalogError}</AlertDescription>
              </Alert>
            )}
            {catalog && !catalogLoading && (
              <div className="text-xs space-y-1 text-muted-foreground">
                <p className="text-foreground font-medium">{t('layout.toolbar.loaded')}</p>
                <p>{t('layout.toolbar.source', { sourceHint: catalog.sourceHint })}</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
                  <span>{t('layout.toolbar.heroes', { length: catalog.heroes.length })}</span>
                  <span>{t('layout.toolbar.creatures', { length: catalog.creatures.length })}</span>
                  <span>{t('layout.toolbar.artifacts', { length: catalog.artifacts.length })}</span>
                  <span>{t('layout.toolbar.spells', { length: catalog.spells.length })}</span>
                  <span>{t('layout.toolbar.skills', { length: catalog.skills.length })}</span>
                  <span>{t('layout.toolbar.buffs', { length: catalog.buffs.length })}</span>
                  <span>{t('layout.toolbar.mapObjects', { length: catalog.mapObjects.length })}</span>
                  <span>{t('layout.toolbar.dialogs', { length: catalog.dialogs.length })}</span>
                </div>
              </div>
            )}
            {!catalog && !catalogLoading && !catalogError && (
              <p className="text-xs text-muted-foreground">
                {t('layout.toolbar.gameDataNotLoadedDropdowns')}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => { loadCatalog(); setCatalogDialogOpen(false) }} disabled={catalogLoading}>
                {catalog ? t('layout.toolbar.rebuild') : t('layout.toolbar.autoDetect')}
              </Button>
              <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleCatalogPickFile} disabled={catalogLoading}>
                {t('layout.toolbar.loadCoreZip')}
              </Button>
              {catalog && (
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => clearCatalog()} disabled={catalogLoading}>
                  {t('shared.clear')}
                </Button>
              )}
              {onDialogBrowserOpen && catalog && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { onDialogBrowserOpen(); setCatalogDialogOpen(false) }}>
                  <MessageSquare className="h-3 w-3" />
                  {t('layout.toolbar.browseDialogs')}
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

      {/* Theme editor dialog */}
      <ThemeEditorDialog
        open={themeEditorOpen}
        onOpenChange={setThemeEditorOpen}
      />

      {/* Publish dialog (Tauri only) */}
      {isTauri() && (
        <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
      )}

      {/* About works in both builds — the version row just reads "web build" on the web. */}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <HotkeysDialog open={hotkeysOpen} onOpenChange={setHotkeysOpen} />
      <WhatsNewDialog open={whatsNewOpen} onOpenChange={setWhatsNewOpen} />

      {isTauri() && (
        <ImportH3mDialog
          open={importH3mOpen}
          onOpenChange={setImportH3mOpen}
        />
      )}

      {isTauri() && (
        <NewMapDialog
          open={newMapOpen}
          onOpenChange={setNewMapOpen}
          onCreated={({ warnings }) => {
            if (warnings.length > 0) {
              setImportWarnings(warnings)
              setImportFeedbackOpen(true)
            }
          }}
        />
      )}

      {/* Manual update check result — only for the no-update / failure cases;
          a found update is handed to AppShell's banner and dialog instead. */}
      <Dialog open={!!updateMessage} onOpenChange={(o) => !o && setUpdateMessage(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('layout.toolbar.updateDialogTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{updateMessage}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
