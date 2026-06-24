import { useEffect, useRef, useCallback, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useScenarioStore } from '@/store/useScenarioStore'
import { exportProjectJson } from '@/lib/export'
import { isTauri, saveFile, saveToPath, confirmDialog } from '@/lib/native-fs'
import { createPanelSyncChannel, PANEL_META } from '@/lib/panel-sync'
import type { PanelState } from '@/lib/panel-sync'
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
import { SquareArrowOutUpRight } from 'lucide-react'

// ─── Placeholder shown where a panel would be when it's undocked ──────────────

function UndockedPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground gap-2">
      <SquareArrowOutUpRight className="h-4 w-4 opacity-40" />
      {label} is open in a separate window
    </div>
  )
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export default function AppShell() {
  const {
    scenario,
    isDirty,
    panels,
    currentFilePath,
    currentFileName,
    mapName,
    dialogs,
    localization,
    setSidebarWidth,
    resetScenario,
    markClean,
    setCurrentFile,
    setSelection,
  } = useScenarioStore()

  const [paletteOpen,  setPaletteOpen]  = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [diagramOpen,  setDiagramOpen]  = useState(false)
  const [statsOpen,    setStatsOpen]    = useState(false)

  // Track which panels are currently undocked
  const [undocked, setUndocked] = useState<Set<string>>(new Set())

  // Keep refs for values used in event handlers (avoids stale closures)
  const isDirtyRef         = useRef(isDirty)
  const scenarioRef        = useRef(scenario)
  const currentFilePathRef = useRef(currentFilePath)
  const currentFileNameRef = useRef(currentFileName)
  const mapNameRef         = useRef(mapName)
  const dialogsRef         = useRef(dialogs)
  const localizationRef    = useRef(localization)
  const undockedRef        = useRef(undocked)
  useEffect(() => { isDirtyRef.current         = isDirty },         [isDirty])
  useEffect(() => { scenarioRef.current         = scenario },         [scenario])
  useEffect(() => { currentFilePathRef.current  = currentFilePath },  [currentFilePath])
  useEffect(() => { currentFileNameRef.current  = currentFileName },  [currentFileName])
  useEffect(() => { mapNameRef.current          = mapName },          [mapName])
  useEffect(() => { dialogsRef.current          = dialogs },          [dialogs])
  useEffect(() => { localizationRef.current     = localization },     [localization])
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
  const handleSave = useCallback(async () => {
    const json = exportProjectJson(
      scenarioRef.current,
      mapNameRef.current,
      dialogsRef.current,
      localizationRef.current,
    )
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

  // ── New handler ──────────────────────────────────────────────────────────────
  const handleNew = useCallback(async () => {
    if (isDirtyRef.current) {
      const ok = await confirmDialog(
        'You have unsaved changes. Start a new scenario anyway?',
        'New Scenario',
      )
      if (!ok) return
    }
    resetScenario()
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
        const s = useScenarioStore.getState()
        const state: PanelState = {
          scenario:     s.scenario,
          mapName:      s.mapName,
          dialogs:      s.dialogs,
          localization: s.localization,
          selectedType: s.selectedType,
          selectedPath: s.selectedPath,
        }
        channel.broadcastState(state)
      }, 100)
    }

    // Subscribe to store changes and broadcast
    const unsubscribe = useScenarioStore.subscribe(broadcast)

    // Also forward actions from undocked windows back to the store
    const unlistenAction = channel.onAction((action) => {
      if (action.name === 'setSelection') {
        const [type, path] = action.args
        useScenarioStore.getState().setSelection(type, path)
      }
    })

    return () => {
      unsubscribe()
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
      setUndocked((prev) => {
        const next = new Set(prev)
        next.delete(panelId)
        return next
      })
    })

    // Broadcast initial state once the panel window has loaded so it can receive it
    win.once('tauri://created', () => {
      const s = useScenarioStore.getState()
      const state: PanelState = {
        scenario:     s.scenario,
        mapName:      s.mapName,
        dialogs:      s.dialogs,
        localization: s.localization,
        selectedType: s.selectedType,
        selectedPath: s.selectedPath,
      }
      const ch = createPanelSyncChannel('main-immediate')
      // Delay slightly to allow the panel's BroadcastChannel listener to mount
      setTimeout(() => { ch.broadcastState(state); ch.destroy() }, 300)
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
          case 'new':     handleNew(); break
          case 'open':    window.dispatchEvent(new Event('oe:open')); break
          case 'save':    handleSave(); break
          case 'save-as': window.dispatchEvent(new Event('oe:save-as')); break
          case 'undo':
            useScenarioStore.temporal.getState().undo()
            useScenarioStore.setState({ isDirty: true })
            break
          case 'redo':
            useScenarioStore.temporal.getState().redo()
            useScenarioStore.setState({ isDirty: true })
            break
        }
      })

      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      unlistenClose = await win.onCloseRequested(async (closeEvent) => {
        closeEvent.preventDefault()

        try {
          // Close all undocked panels first
          const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
          for (const panelId of undockedRef.current) {
            const panelWin = await WebviewWindow.getByLabel(`panel-${panelId}`)
            await panelWin?.destroy()
          }

          if (!isDirtyRef.current) {
            await win.destroy()
            return
          }
          const ok = await confirmDialog(
            'You have unsaved changes. Quit without saving?',
            'Unsaved Changes',
          )
          if (ok) await win.destroy()
        } catch {
          // Fallback: force-exit if destroy fails for any reason
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
  useEffect(() => {
    if (!isTauri()) return
    ;(async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const base  = currentFileName ?? 'Map Editor'
      const dirty = isDirty ? '● ' : ''
      getCurrentWindow().setTitle(`${dirty}${base} — Map Editor`)
    })()
  }, [isDirty, currentFileName])

  // ── Derived helpers ───────────────────────────────────────────────────────────
  const isUndocked = (id: string) => undocked.has(id)
  // setSelection is used only to keep TypeScript happy about the import
  void setSelection

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar
        onSearchOpen={() => setPaletteOpen(true)}
        onTimelineOpen={() => setTimelineOpen(true)}
        onDiagramOpen={() => setDiagramOpen(true)}
        onStatsOpen={() => setStatsOpen(true)}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={() => window.dispatchEvent(new Event('oe:save-as'))}
        onOpen={() => window.dispatchEvent(new Event('oe:open'))}
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
      <Group
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex-1 overflow-hidden"
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
          <aside className="flex h-full flex-col overflow-hidden border-r border-border">
            <ScenarioTree />
          </aside>
        </Panel>

        <Separator className="w-1 cursor-col-resize bg-border transition-colors hover:bg-primary/40 focus-visible:outline-none" />

        {/* ── Editor ── */}
        <Panel
          panelRef={editorPanelRef}
          id="editor"
          defaultSize="50%"
          minSize="20%"
          collapsible
        >
          <main className="flex h-full flex-col overflow-hidden border-r border-border">
            <EditorPanel />
          </main>
        </Panel>

        <Separator className="w-1 cursor-col-resize bg-border transition-colors hover:bg-primary/40 focus-visible:outline-none" />

        {/* ── Preview ── */}
        <Panel
          panelRef={previewPanelRef}
          id="preview"
          defaultSize="30%"
          minSize="15%"
          collapsible
        >
          <aside className="flex h-full flex-col overflow-hidden">
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
    </div>
  )
}
