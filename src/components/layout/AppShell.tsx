import { useEffect, useRef, useState } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { useScenarioStore } from '@/store/useScenarioStore'
import Toolbar from './Toolbar'
import ScenarioTree from '@/components/tree/ScenarioTree'
import EditorPanel from '@/components/editors/EditorPanel'
import JsonPreview from '@/components/common/JsonPreview'
import CommandPalette from '@/components/common/CommandPalette'
import TimelineDialog from '@/components/common/TimelineDialog'

export default function AppShell() {
  const { panels, setSidebarWidth } = useScenarioStore()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)

  // ── Imperative panel handles for toolbar-driven collapse / expand ───────────
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null)
  const editorPanelRef  = useRef<PanelImperativeHandle | null>(null)
  const previewPanelRef = useRef<PanelImperativeHandle | null>(null)

  // ── localStorage persistence ─────────────────────────────────────────────────
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'main-layout',
    storage: localStorage,
  })

  // Sync Zustand panel-visibility state → imperative collapse / expand
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

  // ── Undo / Redo / Command Palette keyboard shortcuts ────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar onSearchOpen={() => setPaletteOpen(true)} onTimelineOpen={() => setTimelineOpen(true)} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TimelineDialog open={timelineOpen} onOpenChange={setTimelineOpen} />
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
