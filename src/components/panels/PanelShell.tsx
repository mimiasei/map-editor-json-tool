import { useEffect, useState } from 'react'
import { createPanelSyncChannel, PANEL_META, type PanelState, type PanelAction } from '@/lib/panel-sync'
import PanelContent from './PanelContent'

interface Props {
  panelId: string
}

/**
 * Root component rendered inside undocked Tauri panel windows.
 * URL: /?panel=<panelId>
 *
 * Layout:
 *   ┌────────────────────────────────┐
 *   │ Panel title       [Re-dock ×] │  ← 36px header
 *   ├────────────────────────────────┤
 *   │                               │
 *   │  <PanelContent />             │
 *   │                               │
 *   └────────────────────────────────┘
 *
 * State arrives via BroadcastChannel from the main window.
 * Until the first state message, a loading indicator is shown.
 */
export default function PanelShell({ panelId }: Props) {
  const [panelState, setPanelState] = useState<PanelState | null>(null)
  const [channel] = useState(() => createPanelSyncChannel(`panel-${panelId}`))

  const meta = PANEL_META[panelId] ?? { title: panelId, width: 800, height: 600 }

  // Listen for state broadcasts from the main window
  useEffect(() => {
    const unlisten = channel.onState((state) => {
      setPanelState(state)
    })
    return () => {
      unlisten()
      channel.destroy()
    }
  // channel is stable (created once in useState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sendAction = (action: PanelAction) => channel.sendAction(action)

  const handleRedock = async () => {
    // Close this Tauri window — AppShell listens for the close event and
    // removes the panel from the `undocked` set, causing it to re-appear.
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    getCurrentWindow().close()
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ── Window chrome ─────────────────────────────────────────────────── */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">{meta.title}</span>
        <button
          onClick={handleRedock}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          Re-dock
          <span aria-hidden>×</span>
        </button>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {panelState === null ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Waiting for main window…
          </div>
        ) : (
          <PanelContent
            panelId={panelId}
            state={panelState}
            sendAction={sendAction}
          />
        )}
      </div>
    </div>
  )
}
