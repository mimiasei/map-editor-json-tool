// ─── Panel sync via BroadcastChannel ─────────────────────────────────────────
// Used to keep undocked Tauri panel windows in sync with the main window's
// Zustand store. The main window is the source of truth and broadcasts state
// snapshots; undocked windows mirror the state and can send lightweight
// actions back.

import type { ScenarioFile, SelectionType } from '@/types/scenario'
import type { DialogFlow } from '@/types/dialog'

// ─── Panel metadata ───────────────────────────────────────────────────────────

export const PANEL_META: Record<string, { title: string; width: number; height: number }> = {
  preview:  { title: 'JSON Preview',        width: 600,  height: 800 },
  timeline: { title: 'Event Timeline',      width: 900,  height: 600 },
  flow:     { title: 'Quest Flow Diagram',  width: 1000, height: 700 },
  stats:    { title: 'Scenario Statistics', width: 800,  height: 600 },
}

// ─── Message types ────────────────────────────────────────────────────────────

/** Slice of store state that undocked panels need. */
export interface PanelState {
  scenario:     ScenarioFile
  mapName:      string
  dialogs:      Record<string, DialogFlow>
  localization: Record<string, string>
  selectedType: SelectionType
  selectedPath: number[]
}

/** Actions an undocked panel can send back to the main window. */
export type PanelAction =
  | { name: 'setSelection'; args: [SelectionType, number[]] }

export type SyncMessage =
  | { type: 'state';  sourceId: string; payload: PanelState }
  | { type: 'action'; sourceId: string; payload: PanelAction }

// ─── Channel factory ──────────────────────────────────────────────────────────

const CHANNEL_NAME = 'oe-panel-sync'

export function createPanelSyncChannel(sourceId: string) {
  const channel = new BroadcastChannel(CHANNEL_NAME)

  /** Broadcast the full panel state to all other windows. */
  function broadcastState(state: PanelState): void {
    const msg: SyncMessage = { type: 'state', sourceId, payload: state }
    channel.postMessage(msg)
  }

  /** Send a user action from an undocked window to the main window. */
  function sendAction(action: PanelAction): void {
    const msg: SyncMessage = { type: 'action', sourceId, payload: action }
    channel.postMessage(msg)
  }

  /**
   * Listen for state messages from other windows.
   * Returns an unlisten function.
   */
  function onState(cb: (state: PanelState) => void): () => void {
    const handler = (e: MessageEvent<SyncMessage>) => {
      if (e.data.type === 'state' && e.data.sourceId !== sourceId) {
        cb(e.data.payload)
      }
    }
    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }

  /**
   * Listen for action messages from other windows.
   * Returns an unlisten function.
   */
  function onAction(cb: (action: PanelAction) => void): () => void {
    const handler = (e: MessageEvent<SyncMessage>) => {
      if (e.data.type === 'action' && e.data.sourceId !== sourceId) {
        cb(e.data.payload)
      }
    }
    channel.addEventListener('message', handler)
    return () => channel.removeEventListener('message', handler)
  }

  function destroy(): void {
    channel.close()
  }

  return { broadcastState, sendAction, onState, onAction, destroy }
}
