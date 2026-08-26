import { useEffect, useRef, useCallback, useState } from 'react'
import { useApplyThemeSettings } from '@/hooks/useApplyThemeSettings'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useScenarioStore } from '@/store/useScenarioStore'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import { useMapGridStore } from '@/store/useMapGridStore'
import { useMapDocumentStore, commitMapIfDirty } from '@/store/useMapDocumentStore'
import { exportProjectJson, isScenarioEmpty } from '@/lib/export'
import { isTauri, saveFile, saveToPath, confirmDialog } from '@/lib/native-fs'
import { logInfo, logError } from '@/lib/logger'
import { createPanelSyncChannel, PANEL_META } from '@/lib/panel-sync'
import type { PanelState } from '@/lib/panel-sync'
import { warmThumbnailDir } from '@/lib/catalog/thumbnails'
import { loadThumbnailManifest, getThumbnailCount } from '@/hooks/useThumbnailManifest'
import { buildIconRequests, newlyRequestedIcons } from '@/lib/catalog/icon-requests'
import { checkForUpdate, isUpdaterAvailable } from '@/lib/updater'
import type { AvailableUpdate } from '@/lib/updater'
import { restoreSessionHandoff } from '@/lib/session-handoff'
import type { RestoreResult } from '@/lib/session-handoff'
import { UpdateBanner, RestoreBanner, ThumbnailsBanner } from '@/components/common/UpdateBanner'
import UpdateDialog from '@/components/common/UpdateDialog'
import UnsavedChangesDialog from '@/components/common/UnsavedChangesDialog'
import Toolbar from './Toolbar'
import ScenarioTree from '@/components/tree/ScenarioTree'
import EditorPanel from '@/components/editors/EditorPanel'
import JsonPreview from '@/components/common/JsonPreview'
import CommandPalette from '@/components/common/CommandPalette'
import TimelineDialog from '@/components/common/TimelineDialog'
import QuestFlowDialog from '@/components/common/QuestFlowDialog'
import StatsDialog from '@/components/common/StatsDialog'
import DialogEditor from '@/components/dialogs/DialogEditor'
import LocalizationDialog from '@/components/dialogs/LocalizationDialog'
import GuidesDialog from '@/components/guides/GuidesDialog'
import TemplatePickerDialog from '@/components/guides/TemplatePickerDialog'
import ScriptTemplateDialog from '@/components/tree/ScriptTemplateDialog'
import DialogBrowser from '@/components/catalog/DialogBrowser'
import GameDatabaseDialog from '@/components/catalog/GameDatabaseDialog'
import MapGridDialog from '@/components/map-grid/MapGridDialog'
import ThumbnailExtractDialog from '@/components/common/ThumbnailExtractDialog'
import SetupDialog from '@/components/common/SetupDialog'
import { SquareArrowOutUpRight } from 'lucide-react'

const SETUP_SHOWN_KEY = 'oe-setup-shown'

// ─── Placeholder shown where a panel would be when it's undocked ──────────────

function UndockedPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground gap-2">
      <SquareArrowOutUpRight className="h-4 w-4 opacity-40" />
      {label} is open in a separate window
    </div>
  )
}

// ─── Panel state snapshot ─────────────────────────────────────────────────────
// Shared by the debounced broadcast effect and the "just undocked" initial
// broadcast so both stay in sync without duplicating the field list.

function buildPanelState(): PanelState {
  const s = useScenarioStore.getState()
  return {
    scenario:     s.scenario,
    mapName:      s.mapName,
    dialogs:      s.dialogs,
    localization: s.localization,
    translations:     s.translations,
    customHeroes:      s.customHeroes,
    customMapObjects:  s.customMapObjects,
    customArtifacts:   s.customArtifacts,
    customBuffs:       s.customBuffs,
    selectedType: s.selectedType,
    selectedPath: s.selectedPath,
    mapContext:       useMapContextStore.getState().context,
    selectedGridNode: useMapGridStore.getState().selectedNode,
  }
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const {
    scenario,
    isDirty,
    panels,
    currentFilePath,
    currentFileName,
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
    setSidebarWidth,
    resetScenario,
    markClean,
    setCurrentFile,
    setSelection,
  } = useScenarioStore()
  const mapIsDirty = useMapDocumentStore((s) => s.mapIsDirty)

  const [paletteOpen,   setPaletteOpen]   = useState(false)
  const [timelineOpen,  setTimelineOpen]  = useState(false)
  const [diagramOpen,   setDiagramOpen]   = useState(false)
  const [statsOpen,     setStatsOpen]     = useState(false)
  const [templateOpen,  setTemplateOpen]  = useState(false)
  const [scriptTemplatesOpen, setScriptTemplatesOpen] = useState(false)
  const [guidesOpen,    setGuidesOpen]    = useState(false)
  const [dialogBrowserOpen, setDialogBrowserOpen] = useState(false)
  const [gameDatabaseOpen, setGameDatabaseOpen] = useState(false)
  const [mapGridOpen, setMapGridOpen] = useState(false)
  // Desktop exit-confirmation (issue #195 follow-up) — resolved via
  // askExitChoice below, which the close-request handler awaits.
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const exitChoiceResolverRef = useRef<((choice: 'save' | 'discard' | 'cancel') => void) | null>(null)
  const askExitChoice = useCallback((): Promise<'save' | 'discard' | 'cancel'> => {
    return new Promise((resolve) => {
      exitChoiceResolverRef.current = resolve
      setExitConfirmOpen(true)
    })
  }, [])
  const resolveExitChoice = (choice: 'save' | 'discard' | 'cancel') => {
    setExitConfirmOpen(false)
    exitChoiceResolverRef.current?.(choice)
    exitChoiceResolverRef.current = null
  }
  const [thumbnailDialogOpen, setThumbnailDialogOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  // ── Auto-update state ────────────────────────────────────────────────────────
  // `updateDismissed` is component state on purpose: dismissal lasts for the
  // session only, so the banner returns on the next launch (issue #51).
  const [pendingUpdate, setPendingUpdate] = useState<AvailableUpdate | null>(null)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)
  const [restoreInfo, setRestoreInfo] = useState<RestoreResult | null>(null)
  // Count of icons the app now wants that the last extraction never asked for.
  const [pendingIcons, setPendingIcons] = useState(0)
  const [iconsDismissed, setIconsDismissed] = useState(false)

  // Apply user-customized theme settings (CSS vars + font-size) on light theme.
  useApplyThemeSettings()

  // ── Background catalog load + thumbnail manifest on startup ──────────────────
  useEffect(() => {
    useCatalogStore.getState().load()

    if (isTauri()) {
      // Pre-warm thumbnail dir cache and load manifest
      Promise.all([warmThumbnailDir(), loadThumbnailManifest()])

      // Restore a session parked by an update before anything else can dirty the
      // store, then show the first-run wizard only if we did NOT restore — a
      // returning user with restored work shouldn't be handed a setup prompt.
      restoreSessionHandoff()
        .then((result) => {
          if (result.restored) {
            setRestoreInfo(result)
            return
          }
          if (!localStorage.getItem(SETUP_SHOWN_KEY)) setSetupOpen(true)
        })
        .catch(() => {
          if (!localStorage.getItem(SETUP_SHOWN_KEY)) setSetupOpen(true)
        })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pending artwork ──────────────────────────────────────────────────────────
  // Releases keep teaching the extractor about new icons; without this the only
  // symptom is silently missing portraits. Needs the catalog, so it runs once that
  // has loaded, and again whenever an extraction finishes.
  useEffect(() => {
    if (!isTauri()) return

    const recount = () => {
      const catalog = useCatalogStore.getState().catalog
      if (!catalog) return
      // Don't compete with the first-run wizard: a fresh install has extracted
      // nothing and is already being walked through it.
      const neverExtracted = getThumbnailCount() === 0
      const pending = neverExtracted ? 0 : newlyRequestedIcons(buildIconRequests(catalog)).length
      setPendingIcons(pending)
    }

    const unsubscribe = useCatalogStore.subscribe(recount)
    const onExtracted = () => { setIconsDismissed(false); recount() }
    window.addEventListener('oe:thumbnails-extracted', onExtracted)
    recount()

    return () => {
      unsubscribe()
      window.removeEventListener('oe:thumbnails-extracted', onExtracted)
    }
  }, [])

  // ── Update check on startup (non-blocking, packaged builds only) ─────────────
  useEffect(() => {
    if (!isUpdaterAvailable()) return
    let cancelled = false
    // Small delay so the check never competes with first paint or the catalog load.
    const timer = setTimeout(() => {
      checkForUpdate().then((outcome) => {
        if (cancelled) return
        if (outcome.status === 'update') setPendingUpdate(outcome.update)
      })
    }, 4000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // Let the Toolbar's "Check for updates…" hand a found update back to the banner
  // and dialog, reusing the same UI as the startup path.
  useEffect(() => {
    const onFound = (e: Event) => {
      const update = (e as CustomEvent<AvailableUpdate>).detail
      setPendingUpdate(update)
      setUpdateDismissed(false)
      setUpdateDialogOpen(true)
    }
    window.addEventListener('oe:update-found', onFound)
    return () => window.removeEventListener('oe:update-found', onFound)
  }, [])

  // Track which panels are currently undocked
  const [undocked, setUndocked] = useState<Set<string>>(new Set())

  // Keep refs for values used in event handlers (avoids stale closures)
  const isDirtyRef         = useRef(isDirty)
  const scenarioRef        = useRef(scenario)
  const currentFilePathRef = useRef(currentFilePath)
  const currentFileNameRef = useRef(currentFileName)
  const sidecarPathRef     = useRef(sidecarPath)
  const mapFilePathRef     = useRef(mapFilePath)
  const mapNameRef         = useRef(mapName)
  const dialogsRef         = useRef(dialogs)
  const localizationRef    = useRef(localization)
  const translationsRef    = useRef(translations)
  const customHeroesRef       = useRef(customHeroes)
  const customMapObjectsRef   = useRef(customMapObjects)
  const customArtifactsRef    = useRef(customArtifacts)
  const customBuffsRef        = useRef(customBuffs)
  const undockedRef        = useRef(undocked)
  useEffect(() => { isDirtyRef.current         = isDirty },         [isDirty])
  useEffect(() => { scenarioRef.current         = scenario },         [scenario])
  useEffect(() => { currentFilePathRef.current  = currentFilePath },  [currentFilePath])
  useEffect(() => { currentFileNameRef.current  = currentFileName },  [currentFileName])
  useEffect(() => { sidecarPathRef.current      = sidecarPath },      [sidecarPath])
  useEffect(() => { mapFilePathRef.current      = mapFilePath },      [mapFilePath])
  useEffect(() => { mapNameRef.current          = mapName },          [mapName])
  useEffect(() => { dialogsRef.current          = dialogs },          [dialogs])
  useEffect(() => { localizationRef.current     = localization },     [localization])
  useEffect(() => { translationsRef.current     = translations },     [translations])
  useEffect(() => { customHeroesRef.current      = customHeroes },      [customHeroes])
  useEffect(() => { customMapObjectsRef.current  = customMapObjects },  [customMapObjects])
  useEffect(() => { customArtifactsRef.current   = customArtifacts },   [customArtifacts])
  useEffect(() => { customBuffsRef.current       = customBuffs },       [customBuffs])
  useEffect(() => { undockedRef.current         = undocked },         [undocked])

  // ── Imperative panel handles ─────────────────────────────────────────────────
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null)
  const editorPanelRef  = useRef<PanelImperativeHandle | null>(null)
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null)

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'main-layout',
    storage: localStorage,
  })

  useEffect(() => {
    if (panels.sidebar) sidebarPanelRef.current?.expand()
    else sidebarPanelRef.current?.collapse()
  }, [panels.sidebar])

  useEffect(() => {
    if (panels.editor) editorPanelRef.current?.expand()
    else editorPanelRef.current?.collapse()
  }, [panels.editor])

  useEffect(() => {
    if (panels.preview) previewPanelRef.current?.expand()
    else previewPanelRef.current?.collapse()
  }, [panels.preview])

  // ── Save helper (used by Ctrl+S and native menu) ─────────────────────────────
  // issue #195 follow-up: Save is unified — also commits any pending Map
  // Grid edit, and skips creating a sidecar .json when the scenario has no
  // real content. Was previously missing customHeroes/customMapObjects/
  // customArtifacts/customBuffs (dropped silently on every native-menu/
  // Ctrl+S save — Toolbar.tsx's own handleSave, unreachable dead code since
  // nothing ever dispatches 'oe:save', had the correct/complete version) and
  // the sidecarPath branch a .map-anchored project needs — both fixed here
  // while unifying, matching Toolbar.tsx's own logic exactly.
  const handleSave = useCallback(async () => {
    await commitMapIfDirty(mapFilePathRef.current)
    if (isScenarioEmpty(
      scenarioRef.current, dialogsRef.current, localizationRef.current, translationsRef.current,
      customHeroesRef.current, customMapObjectsRef.current, customArtifactsRef.current, customBuffsRef.current,
    )) {
      markClean()
      return
    }
    const json = exportProjectJson(
      scenarioRef.current,
      mapNameRef.current,
      dialogsRef.current,
      localizationRef.current,
      translationsRef.current,
      customHeroesRef.current,
      customMapObjectsRef.current,
      customArtifactsRef.current,
      customBuffsRef.current,
    )
    if (isTauri() && sidecarPathRef.current) {
      await saveToPath(sidecarPathRef.current, json)
      markClean()
      return
    }
    if (currentFilePathRef.current) {
      await saveToPath(currentFilePathRef.current, json)
      markClean()
    } else {
      const savedPath = await saveFile(json, currentFileNameRef.current ?? 'scenario.json')
      if (savedPath) {
        setCurrentFile(savedPath, savedPath.replace(/\\/g, '/').split('/').pop() ?? savedPath)
        markClean()
      } else if (!isTauri()) {
        markClean()
      }
    }
  }, [markClean, setCurrentFile])

  // Web-only unsaved-changes exit guard (issue #195 follow-up) — the
  // desktop build gets a real confirmation dialog with a Save shortcut via
  // Tauri's onCloseRequested below; a browser tab close/reload can only
  // trigger the browser's own generic, non-customizable "leave site?"
  // prompt (no custom buttons possible by browser design), but that's still
  // real protection the web build previously had none of at all.
  useEffect(() => {
    if (isTauri()) return
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyRef.current && !useMapDocumentStore.getState().mapIsDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ── New handler ──────────────────────────────────────────────────────────────
  const handleNew = useCallback(async () => {
    if (isDirtyRef.current || useMapDocumentStore.getState().mapIsDirty) {
      const ok = await confirmDialog(
        'You have unsaved changes. Start a new scenario anyway?',
        'New Scenario',
      )
      if (!ok) return
    }
    resetScenario()
    useMapDocumentStore.getState().clear()
  }, [resetScenario])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const tag = (e.target as HTMLElement)?.tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        useScenarioStore.temporal.getState().undo()
        useScenarioStore.setState({ isDirty: true })
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        useScenarioStore.temporal.getState().redo()
        useScenarioStore.setState({ isDirty: true })
      }
      if (e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (e.key === 's' && !e.shiftKey) {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 's' && e.shiftKey) {
        e.preventDefault()
        window.dispatchEvent(new Event('oe:save-as'))
      }
      if (e.key === 'n') {
        e.preventDefault()
        handleNew()
      }
      if (e.key === 'o') {
        e.preventDefault()
        window.dispatchEvent(new Event('oe:open'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, handleNew])

  // ── BroadcastChannel sync (Tauri only) ───────────────────────────────────────
  useEffect(() => {
    if (!isTauri()) return

    const channel = createPanelSyncChannel('main')

    // Debounced broadcast
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const broadcast = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        channel.broadcastState(buildPanelState())
      }, 100)
    }

    // Subscribe to store changes and broadcast. Map context/grid-selection are
    // separate stores from the scenario one (issue #125's mapGridCell panel).
    const unsubscribe = useScenarioStore.subscribe(broadcast)
    const unsubscribeMapContext = useMapContextStore.subscribe(broadcast)
    const unsubscribeMapGrid = useMapGridStore.subscribe(broadcast)

    // Also forward actions from undocked windows back to the store
    const unlistenAction = channel.onAction((action) => {
      if (action.name === 'setSelection') {
        const [type, path] = action.args
        useScenarioStore.getState().setSelection(type, path)
      }
    })

    return () => {
      unsubscribe()
      unsubscribeMapContext()
      unsubscribeMapGrid()
      unlistenAction()
      if (debounceTimer) clearTimeout(debounceTimer)
      channel.destroy()
    }
  }, [])

  // ── Undock handler (Tauri only) ───────────────────────────────────────────────
  const handleUndock = useCallback(async (panelId: string) => {
    if (!isTauri()) return

    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
    const meta = PANEL_META[panelId]

    // If already open, focus it
    const existing = await WebviewWindow.getByLabel(`panel-${panelId}`)
    if (existing) {
      existing.setFocus()
      return
    }

    setUndocked((prev) => new Set([...prev, panelId]))
    logInfo(`Undocking panel: ${panelId}`)

    const win = new WebviewWindow(`panel-${panelId}`, {
      url:       `/?panel=${panelId}`,
      title:     meta?.title ?? panelId,
      width:     meta?.width  ?? 800,
      height:    meta?.height ?? 600,
      minWidth:  400,
      minHeight: 300,
      resizable: true,
    })

    // If window creation fails, undo the undocked state
    win.once('tauri://error', () => {
      logError(`Panel window creation failed: ${panelId}`)
      setUndocked((prev) => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    })

    // Broadcast initial state once the panel window has loaded so it can receive it
    win.once('tauri://created', () => {
      const ch = createPanelSyncChannel('main-immediate')
      // Delay slightly to allow the panel's BroadcastChannel listener to mount
      setTimeout(() => { ch.broadcastState(buildPanelState()); ch.destroy() }, 300)
    })

    // When the panel window is closed (by user or re-dock button), re-dock it
    const unlistenClose = await win.onCloseRequested(() => {
      setUndocked((prev) => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
      unlistenClose()
    })
  }, [])

  // ── Tauri-only effects ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTauri()) return

    let unlistenMenu: (() => void) | undefined
    let unlistenClose: (() => void) | undefined

    ;(async () => {
      const { listen } = await import('@tauri-apps/api/event')
      unlistenMenu = await listen<string>('menu-action', (event) => {
        switch (event.payload) {
          case 'new':      handleNew(); break
          case 'open':     window.dispatchEvent(new Event('oe:open')); break
          case 'open-map': window.dispatchEvent(new Event('oe:open-map')); break
          case 'save':     handleSave(); break
          case 'save-as':  window.dispatchEvent(new Event('oe:save-as')); break
          case 'undo':
            useScenarioStore.temporal.getState().undo()
            useScenarioStore.setState({ isDirty: true })
            break
          case 'redo':
            useScenarioStore.temporal.getState().redo()
            useScenarioStore.setState({ isDirty: true })
            break
          // Help menu — the Toolbar owns both dialogs, so relay rather than duplicate.
          case 'about':         window.dispatchEvent(new Event('oe:about')); break
          case 'check-updates': window.dispatchEvent(new Event('oe:check-updates')); break
          // win.close() (defined just below) fires the same closeRequested event
          // the window's own [x] button does — reuses that handler's dirty-check
          // + save-prompt flow rather than duplicating it here. Safe to reference
          // `win` ahead of its own declaration: this callback only ever RUNS once
          // a real menu event fires, well after the enclosing async function has
          // finished assigning it.
          case 'quit': win.close(); break
        }
      })

      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      unlistenClose = await win.onCloseRequested(async (closeEvent) => {
        closeEvent.preventDefault()

        try {
          // Close all undocked panels first
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
          const panelIds = [...undockedRef.current]
          if (panelIds.length > 0) logInfo(`Close requested — cleaning up ${panelIds.length} panel(s)`)
          for (const panelId of panelIds) {
            const panelWin = await WebviewWindow.getByLabel(`panel-${panelId}`)
            await panelWin?.destroy()
          }

          if (!isDirtyRef.current && !useMapDocumentStore.getState().mapIsDirty) {
            await win.destroy()
            return
          }
          const choice = await askExitChoice()
          if (choice === 'save') {
            await handleSave()
            await win.destroy()
          } else if (choice === 'discard') {
            await win.destroy()
          }
          // 'cancel': leave the window open, nothing to do.
        } catch {
          // Fallback: force-exit if destroy fails for any reason
          logError('win.destroy() failed — falling back to process.exit')
          const { exit } = await import('@tauri-apps/plugin-process')
          exit(0)
        }
      })
    })()

    return () => {
      unlistenMenu?.()
      unlistenClose?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Window title (Tauri only) ─────────────────────────────────────────────────
  // The window opens correctly titled from tauri.conf.json, then this overwrites it.
  // It used to build `${base} — Map Editor` where base itself fell back to
  // 'Map Editor', so with no file open the title read "Map Editor — Map Editor".
  // The name now comes from the app itself, so it cannot drift from productName.
  useEffect(() => {
    if (!isTauri()) return
    ;(async () => {
      // Name and version both come from tauri.conf.json, so the title tracks the
      // release automatically — no second copy to keep in step.
      let appLabel = 'HommOE Scenario Editor'
      try {
        const { getName, getVersion } = await import('@tauri-apps/api/app')
        const [name, version] = await Promise.all([getName(), getVersion()])
        appLabel = `${name || appLabel}${version ? ` v${version}` : ''}`
      } catch {
        // Keep the fallback — a versionless title beats none.
      }
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const dirty = (isDirty || mapIsDirty) ? '● ' : ''
      const title = currentFileName
        ? `${dirty}${currentFileName} — ${appLabel}`
        : `${dirty}${appLabel}`
      getCurrentWindow().setTitle(title)
    })()
  }, [isDirty, mapIsDirty, currentFileName])

  // ── Derived helpers ───────────────────────────────────────────────────────────
  const isUndocked = (id: string) => undocked.has(id)
  // setSelection is used only to keep TypeScript happy about the import
  void setSelection

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[var(--app-background)] dark:bg-background">
      <Toolbar
        onSearchOpen={() => setPaletteOpen(true)}
        onTimelineOpen={() => setTimelineOpen(true)}
        onDiagramOpen={() => setDiagramOpen(true)}
        onStatsOpen={() => setStatsOpen(true)}
        onTemplateOpen={() => setTemplateOpen(true)}
        onScriptTemplatesOpen={() => setScriptTemplatesOpen(true)}
        onGuidesOpen={() => setGuidesOpen(true)}
        onDialogBrowserOpen={() => setDialogBrowserOpen(true)}
        onGameDatabaseOpen={() => setGameDatabaseOpen(true)}
        onMapGridOpen={() => setMapGridOpen(true)}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={() => window.dispatchEvent(new Event('oe:save-as'))}
        onOpen={() => window.dispatchEvent(new Event('oe:open'))}
      />

      {/* Non-blocking notices under the toolbar */}
      {restoreInfo?.restored && (
        <RestoreBanner
          fileName={restoreInfo.fileName}
          wasDirty={restoreInfo.wasDirty}
          onDismiss={() => setRestoreInfo(null)}
        />
      )}
      {pendingIcons > 0 && !iconsDismissed && (
        <ThumbnailsBanner
          count={pendingIcons}
          onExtract={() => { setIconsDismissed(true); setThumbnailDialogOpen(true) }}
          onDismiss={() => setIconsDismissed(true)}
        />
      )}
      {pendingUpdate && !updateDismissed && (
        <UpdateBanner
          version={pendingUpdate.version}
          onOpen={() => setUpdateDialogOpen(true)}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
      <UpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        update={pendingUpdate}
      />
      <UnsavedChangesDialog
        open={exitConfirmOpen}
        onSave={() => resolveExitChoice('save')}
        onDiscard={() => resolveExitChoice('discard')}
        onCancel={() => resolveExitChoice('cancel')}
      />

      <ThumbnailExtractDialog
        open={thumbnailDialogOpen}
        onOpenChange={setThumbnailDialogOpen}
      />
      <SetupDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TimelineDialog
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        onUndock={() => { setTimelineOpen(false); handleUndock('timeline') }}
        undocked={isUndocked('timeline')}
      />
      <QuestFlowDialog
        open={diagramOpen}
        onOpenChange={setDiagramOpen}
        onUndock={() => { setDiagramOpen(false); handleUndock('flow') }}
        undocked={isUndocked('flow')}
      />
      <StatsDialog
        open={statsOpen}
        onOpenChange={setStatsOpen}
        onUndock={() => { setStatsOpen(false); handleUndock('stats') }}
        undocked={isUndocked('stats')}
      />
      <DialogEditor />
      <LocalizationDialog />
      <TemplatePickerDialog open={templateOpen} onOpenChange={setTemplateOpen} />
      <ScriptTemplateDialog open={scriptTemplatesOpen} onOpenChange={setScriptTemplatesOpen} />
      <GuidesDialog
        open={guidesOpen}
        onOpenChange={setGuidesOpen}
        onUndock={() => { setGuidesOpen(false); handleUndock('guides') }}
        undocked={isUndocked('guides')}
      />
      <DialogBrowser open={dialogBrowserOpen} onOpenChange={setDialogBrowserOpen} />
      <GameDatabaseDialog open={gameDatabaseOpen} onOpenChange={setGameDatabaseOpen} />
      {mapGridOpen ? (
        // Inline view (issue #195 follow-up), not a modal — replaces this
        // whole slot instead of layering on top, so it fills the same space
        // the normal 3-pane editor Group occupies below and needs no resize
        // chrome of its own.
        <div className="flex-1 overflow-hidden p-3">
          <MapGridDialog
            open={mapGridOpen}
            onOpenChange={setMapGridOpen}
            onUndock={() => handleUndock('mapGridCell')}
            undocked={isUndocked('mapGridCell')}
          />
        </div>
      ) : (
      <Group
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex-1 overflow-hidden p-3"
      >
        {/* ── Sidebar ── */}
        <Panel
          panelRef={sidebarPanelRef}
          id="sidebar"
          defaultSize="20%"
          minSize="12%"
          maxSize="30%"
          collapsible
          onResize={(size) => {
            if (size.inPixels > 0) setSidebarWidth(Math.round(size.inPixels))
          }}
        >
          <aside className="flex h-full flex-col overflow-hidden rounded-lg bg-[var(--column-left)] dark:bg-card">
            <ScenarioTree />
          </aside>
        </Panel>

        <Separator className="w-3 cursor-col-resize rounded-lg bg-transparent hover:bg-black/20 transition-colors duration-150 border-0 focus-visible:outline-none" />

        {/* ── Editor ── */}
        <Panel
          panelRef={editorPanelRef}
          id="editor"
          defaultSize="50%"
          minSize="20%"
          collapsible
        >
          <main className="flex h-full flex-col overflow-hidden rounded-lg bg-[var(--column-center)] dark:bg-background">
            <EditorPanel />
          </main>
        </Panel>

        <Separator className="w-3 cursor-col-resize rounded-lg bg-transparent hover:bg-black/20 transition-colors duration-150 border-0 focus-visible:outline-none" />

        {/* ── Preview ── */}
        <Panel
          panelRef={previewPanelRef}
          id="preview"
          defaultSize="30%"
          minSize="15%"
          collapsible
        >
          <aside className="flex h-full flex-col overflow-hidden rounded-lg bg-[var(--column-right)] dark:bg-card">
            {isUndocked('preview') ? (
              <UndockedPlaceholder label="JSON Preview" />
            ) : (
              <JsonPreview
                onUndock={() => handleUndock('preview')}
                undocked={isUndocked('preview')}
              />
            )}
          </aside>
        </Panel>
      </Group>
      )}
    </div>
  )
}
