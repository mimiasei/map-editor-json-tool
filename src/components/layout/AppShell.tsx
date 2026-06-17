import { useScenarioStore } from '@/store/useScenarioStore'
import Toolbar from './Toolbar'
import ScenarioTree from '@/components/tree/ScenarioTree'
import EditorPanel from '@/components/editors/EditorPanel'
import JsonPreview from '@/components/common/JsonPreview'

export default function AppShell() {
  const { panels } = useScenarioStore()

  const visibleCount = [panels.sidebar, panels.editor, panels.preview].filter(Boolean).length

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar />
      <div
        className="flex flex-1 overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: [
            panels.sidebar ? 'minmax(200px, 280px)' : '',
            panels.editor ? '1fr' : '',
            panels.preview ? 'minmax(280px, 400px)' : '',
          ]
            .filter(Boolean)
            .join(' '),
          // Ensure at least something is visible
          ...(visibleCount === 0 ? { gridTemplateColumns: '1fr' } : {}),
        }}
      >
        {panels.sidebar && (
          <aside className="flex flex-col overflow-hidden border-r border-border">
            <ScenarioTree />
          </aside>
        )}
        {panels.editor && (
          <main className="flex flex-col overflow-hidden border-r border-border">
            <EditorPanel />
          </main>
        )}
        {panels.preview && (
          <aside className="flex flex-col overflow-hidden">
            <JsonPreview />
          </aside>
        )}
      </div>
    </div>
  )
}
