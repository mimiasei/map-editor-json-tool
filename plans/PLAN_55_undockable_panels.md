# Issue #55 — Undockable Panels (Desktop)

## Overview

Add undock icons to four read-only panels so they can be popped out into
their own native Tauri windows. Closing an undocked window automatically
re-docks the panel. The browser build is unaffected — all undock affordances
are hidden behind `isTauri()`.

**Scope (this PR):** read-only panels only.
- JSON Preview (right column)
- Timeline dialog
- Quest Flow diagram
- Stats dashboard

**Out of scope (deferred):** Sidebar and EditorPanel — bidirectional sync +
undo history across windows is too complex for this pass.

---

## Architecture

### State sync: BroadcastChannel

Each Tauri WebviewWindow runs its own JS context and therefore its own
Zustand store instance. We use the standard web `BroadcastChannel` API
(supported same-origin across Tauri webviews) to keep undocked panels in sync.

```
Main window                         Undocked window  (?panel=preview)
┌──────────────────────┐            ┌───────────────────────────────┐
│ Zustand (truth)      │  state msg │ useState mirror               │
│                      │ ─────────> │ (overwritten on every msg)    │
│ subscribe → broadcast│            │ renders panel content         │
│ (debounced 100 ms)   │            │                               │
│                      │ action msg │ on user interaction           │
│ apply setSelection() │ <───────── │ (e.g. click quest row)        │
└──────────────────────┘            └───────────────────────────────┘
        BroadcastChannel('oe-panel-sync')
```

Message envelope:
```ts
type SyncMessage =
  | { type: 'state';  sourceId: string; payload: PanelState }
  | { type: 'action'; sourceId: string; payload: PanelAction }

// State broadcast — all fields undocked panels need
interface PanelState {
  scenario:     ScenarioFile
  mapName:      string
  dialogs:      Record<string, DialogFlow>
  localization: Record<string, string>
  selectedType: SelectionType | null
  selectedPath: number[]
}

// Actions panels can send back to main
type PanelAction =
  | { name: 'setSelection'; args: [SelectionType, number[]] }
```

### URL routing

No router is installed. A single `?panel=<id>` query param on the same
`index.html` SPA entry point is used to distinguish panel windows.

`App.tsx` checks `new URLSearchParams(location.search).get('panel')`:
- If present → render `<PanelShell panelId={...} />`
- If absent  → render `<AppShell />` as today

### Tauri window creation

Panel windows are created dynamically from the main window:

```ts
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

new WebviewWindow(`panel-${panelId}`, {
  url:    `/?panel=${panelId}`,
  title:  PANEL_META[panelId].title,
  width:  PANEL_META[panelId].width,
  height: PANEL_META[panelId].height,
  minWidth:  400,
  minHeight: 300,
  resizable: true,
})
```

Window labels start with `panel-` so they are distinguishable from `main`.
The Tauri capabilities file must be updated to cover these windows.

---

## File-by-file changes

### New files

#### `src/lib/panel-sync.ts`
BroadcastChannel abstraction. Exports:
- `createPanelSyncChannel(sourceId: string)` → `{ broadcastState, sendAction, onState, onAction, destroy }`
- `PANEL_META` — static config for each panel:
  ```ts
  export const PANEL_META: Record<string, { title: string; width: number; height: number }> = {
    preview:  { title: 'JSON Preview',       width: 600,  height: 800 },
    timeline: { title: 'Event Timeline',     width: 900,  height: 600 },
    flow:     { title: 'Quest Flow Diagram', width: 1000, height: 700 },
    stats:    { title: 'Scenario Statistics',width: 800,  height: 600 },
  }
  ```
- `PanelState`, `PanelAction`, `SyncMessage` types

#### `src/components/panels/UndockButton.tsx`
Small icon button that triggers undocking. Props:
```ts
interface Props {
  panelId: string
  onUndock: () => void
  disabled?: boolean   // true while already undocked
}
```
- Renders `<SquareArrowOutUpRight>` icon (lucide-react)
- Wrapped in a Tooltip: "Pop out into separate window"
- Only rendered when `isTauri()` — returns `null` otherwise
- Visible on hover of parent container (parent adds `group` class)

#### `src/components/panels/PanelShell.tsx`
Wrapper rendered inside undocked Tauri windows. Props:
```ts
interface Props { panelId: string }
```
Behaviour:
- On mount: creates a `BroadcastChannel` listener via `onState()`, stores
  received state in a local `useState<PanelState | null>`
- Passes state down as a mock store override (context provider) so panel
  components read from the received state instead of the empty local Zustand
  store — see "Store override strategy" below
- Renders:
  ```
  ┌─────────────────────────────────────┐
  │ Panel title              [Re-dock ×]│  ← 36px header
  ├─────────────────────────────────────┤
  │                                     │
  │  <PanelContent />                   │  ← full height minus header
  │                                     │
  └─────────────────────────────────────┘
  ```
- Re-dock button calls `getCurrentWindow().close()` (Tauri API)
- Until first state message arrives, shows a subtle loading state:
  "Waiting for main window…"

#### `src/components/panels/PanelContent.tsx`
Switch component — picks the right component for `panelId`:
```ts
switch (panelId) {
  case 'preview':  return <JsonPreviewContent />
  case 'timeline': return <TimelineContent />
  case 'flow':     return <QuestFlowContent />
  case 'stats':    return <StatsContent />
}
```
These are the *inner content* components extracted from each dialog/panel
(see modifications below).

---

### Modified files

#### `src/App.tsx`
```tsx
const panelId = new URLSearchParams(location.search).get('panel')

export default function App() {
  if (panelId) return <PanelShell panelId={panelId} />
  return <AppShell />
}
```

#### `src/components/common/JsonPreview.tsx`
- Extract inner render logic into `JsonPreviewContent` (no props — reads
  from store)
- Wrap existing `JsonPreview` to render `<JsonPreviewContent />` plus the
  `<UndockButton>` in its header area
- `JsonPreviewContent` is exported separately for `PanelContent`

#### `src/components/common/TimelineDialog.tsx`
- Extract inner dialog body into `TimelineContent` (exported)
- `TimelineDialog` wraps `TimelineContent` in the existing Radix `<Dialog>`
- Add `<UndockButton>` to the dialog title area
- UndockButton `onUndock` callback is passed from AppShell

#### `src/components/common/QuestFlowDialog.tsx`
- Same pattern as TimelineDialog → extract `QuestFlowContent`

#### `src/components/common/StatsDialog.tsx`
- Same pattern → extract `StatsContent`
- The tab state (`useState<Tab>`) stays inside `StatsContent` so it persists
  when switching between docked/undocked states would reset it

#### `src/components/layout/AppShell.tsx`
New responsibilities:
1. **Track undocked panels**: `const [undocked, setUndocked] = useState<Set<string>>(new Set())`
2. **Start broadcasting**: On mount (Tauri only), subscribe to the Zustand
   store and broadcast state changes debounced at 100 ms via `broadcastState()`
3. **Listen for actions**: `onAction()` → apply `setSelection()` to the real
   store when an undocked panel sends a click event
4. **Open undocked windows**: `handleUndock(panelId)` — creates a
   `WebviewWindow`, listens for its `close` event → calls `setUndocked(prev
   => { prev.delete(panelId); return new Set(prev) })`
5. **Pass `onUndock` callbacks** to each dialog's UndockButton
6. **Placeholder panels**: when `undocked.has('preview')`, the right column
   shows `<UndockedPlaceholder label="JSON Preview" />` instead of
   `<JsonPreview />`
7. **Cleanup**: on unmount (or `onCloseRequested`), close all undocked windows
   before destroying

#### `src/components/layout/AppShell.tsx` — placeholder component (inline)
```tsx
function UndockedPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground gap-2">
      <SquareArrowOutUpRight className="h-4 w-4 opacity-40" />
      {label} is open in a separate window
    </div>
  )
}
```

#### `src-tauri/capabilities/default.json`
- Change `"windows": ["main"]` → `"windows": ["main", "panel-*"]`
  (Tauri v2 supports glob patterns for window labels in capabilities)

---

## Store override strategy (undocked windows)

The undocked window has its own empty Zustand store. The received
`PanelState` from BroadcastChannel must be made available to panel
components that call `useScenarioStore()`.

**Approach:** A React context `PanelStateContext` wraps the undocked
panel tree. Components that live inside an undocked window use a custom
hook `usePanelAwareStore()` which:
1. Checks if `PanelStateContext` is available (i.e. we're in an undocked window)
2. If yes — returns the context value (received broadcast state)
3. If no — falls back to `useScenarioStore()` as normal

**Affected components** (the 4 content components + any sub-components they
use that call `useScenarioStore`):
- `JsonPreviewContent`
- `TimelineContent`
- `QuestFlowContent`
- `StatsContent`

These are all read-only renders so only the *selector* side of the store
is needed — no `set` calls from inside content components.

For `setSelection` calls (e.g. clicking a quest row in StatsContent) inside
an undocked window, the content component calls `sendAction({ name:
'setSelection', args: [...] })` via a context-provided callback instead of
calling `useScenarioStore().setSelection` directly.

---

## `setSelection` in undocked panels

The Stats "Per Quest" tab and Quest Flow diagram both call `setSelection()`
to navigate the main window to a quest. When undocked:
- The click handler detects it's inside `PanelStateContext`
- Sends `{ type: 'action', payload: { name: 'setSelection', args: [type, path] } }`
  via BroadcastChannel
- Does NOT close the undocked window (unlike docked dialogs which close on navigate)
- Main window receives the action → calls `setSelection()` on its real store

---

## Edge cases

| Case | Handling |
|------|---------|
| Undock button clicked while already undocked | Button is `disabled`, also `WebviewWindow.getByLabel()` called to focus existing window |
| Main window closed with undocked panels open | `onCloseRequested` iterates `undocked` set and calls `.close()` on each `WebviewWindow` before `win.destroy()` |
| Undocked window closed via OS (× button) | `WebviewWindow` `close` event fires → AppShell removes panelId from `undocked` set, panel re-appears |
| BroadcastChannel not supported | Falls back silently — undocked window shows "Waiting for main window…" indefinitely. BroadcastChannel is supported in all Chromium-based webviews including Tauri's. |
| First render before any broadcast | PanelShell shows a loading state until first `state` message received |
| Multiple undocked windows for same panel | Prevented: UndockButton is disabled when `undocked.has(panelId)` |
| Browser build | `UndockButton` returns `null`, no BroadcastChannel code runs in AppShell (`isTauri()` guard), App.tsx `?panel=` param never set in browser context |

---

## Implementation order

1. `src/lib/panel-sync.ts` — channel abstraction + PANEL_META + types
2. `src/components/panels/UndockButton.tsx` — icon button
3. Extract content components from JsonPreview, TimelineDialog, QuestFlowDialog, StatsDialog
4. `PanelStateContext` + `usePanelAwareStore()` hook
5. `src/components/panels/PanelContent.tsx` — panel switcher
6. `src/components/panels/PanelShell.tsx` — undocked window shell
7. `src/App.tsx` — route to PanelShell when `?panel=` present
8. `src/components/layout/AppShell.tsx` — broadcast + undock lifecycle + placeholders
9. `src-tauri/capabilities/default.json` — extend to panel-* windows
10. Build check + commit

---

## Files created / modified summary

| File | Status |
|------|--------|
| `src/lib/panel-sync.ts` | **New** |
| `src/components/panels/UndockButton.tsx` | **New** |
| `src/components/panels/PanelShell.tsx` | **New** |
| `src/components/panels/PanelContent.tsx` | **New** |
| `src/contexts/PanelStateContext.tsx` | **New** |
| `src/App.tsx` | Modified |
| `src/components/common/JsonPreview.tsx` | Modified (extract content) |
| `src/components/common/TimelineDialog.tsx` | Modified (extract content) |
| `src/components/common/QuestFlowDialog.tsx` | Modified (extract content) |
| `src/components/common/StatsDialog.tsx` | Modified (extract content) |
| `src/components/layout/AppShell.tsx` | Modified (broadcast + undock lifecycle) |
| `src-tauri/capabilities/default.json` | Modified (panel-* windows) |
