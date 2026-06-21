import { useEffect, useRef, useCallback } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useScenarioStore } from '@/store/useScenarioStore'
import { exportScenario } from '@/lib/export'
import { isTauri, saveFile, saveToPath, confirmDialog } from '@/lib/native-fs'
import Toolbar from './Toolbar'
import ScenarioTree from '@/components/tree/ScenarioTree'
import EditorPanel from '@/components/editors/EditorPanel'
import JsonPreview from '@/components/common/JsonPreview'
import CommandPalette from '@/components/common/CommandPalette'
import TimelineDialog from '@/components/common/TimelineDialog'
import QuestFlowDialog from '@/components/common/QuestFlowDialog'
import { useState } from 'react'

export default function AppShell() {
  const {
    scenario,
    isDirty,
    panels,
    currentFilePath,
    currentFileName,
    setSidebarWidth,
    resetScenario,
    markClean,
    setCurrentFile,
  } = useScenarioStore()

  const [paletteOpen,  setPaletteOpen]  = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [diagramOpen,  setDiagramOpen]  = useState(false)

  // Keep refs for values used in event handlers (avoids stale closures)
  const isDirtyRef         = useRef(isDirty)
  const scenarioRef        = useRef(scenario)
  const currentFilePathRef = useRef(currentFilePath)
  const currentFileNameRef = useRef(currentFileName)
  useEffect(() => { isDirtyRef.current         = isDirty },         [isDirty])
  useEffect(() => { scenarioRef.current         = scenario },         [scenario])
  useEffect(() => { currentFilePathRef.current  = currentFilePath },  [currentFilePath])
  useEffect(() => { currentFileNameRef.current  = currentFileName },  [currentFileName])

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
    const json = exportScenario(scenarioRef.current)
    if (currentFilePathRef.current) {
      // Overwrite the existing file silently
      await saveToPath(currentFilePathRef.current, json)
      markClean()
    } else {
      // No open path yet — fall back to Save As
      const savedPath = await saveFile(json, currentFileNameRef.current ?? 'scenario.json')
      if (savedPath) {
        setCurrentFile(savedPath, savedPath.replace(/\\/g, '/').split('/').pop() ?? savedPath)
        markClean()
      } else if (!isTauri()) {
        markClean() // browser download always succeeds
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

      // Suppress shortcuts when focus is in an input / textarea / contenteditable
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

  // ── Tauri-only effects ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTauri()) return

    let unlistenMenu: (() => void) | undefined
    let unlistenClose: (() => void) | undefined

    ;(async () => {
      // 1. Relay native menu events → DOM events handled by Toolbar / AppShell
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

      // 2. Close guard — prompt when there are unsaved changes
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      unlistenClose = await win.onCloseRequested(async (closeEvent) => {
        if (!isDirtyRef.current) return
        closeEvent.preventDefault()
        const ok = await confirmDialog(
          'You have unsaved changes. Quit without saving?',
          'Unsaved Changes',
        )
        if (ok) win.destroy()
      })
    })()

    return () => {
      unlistenMenu?.()
      unlistenClose?.()
    }
  // handleNew and handleSave are stable callbacks (useCallback)
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

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar
        onSearchOpen={() => setPaletteOpen(true)}
        onTimelineOpen={() => setTimelineOpen(true)}
        onDiagramOpen={() => setDiagramOpen(true)}
        onNew={handleNew}
        onSave={handleSave}
        onSaveAs={() => window.dispatchEvent(new Event('oe:save-as'))}
        onOpen={() => window.dispatchEvent(new Event('oe:open'))}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TimelineDialog open={timelineOpen} onOpenChange={setTimelineOpen} />
      <QuestFlowDialog open={diagramOpen} onOpenChange={setDiagramOpen} />
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
            <JsonPreview />
          </aside>
        </Panel>
      </Group>
    </div>
  )
}
