// ─── Configurable keyboard shortcuts ─────────────────────────────────────────
// The registry of every shortcut the editor owns. A combo is a lowercase string: modifiers in the fixed order mod, alt, shift, then the
// key, joined by '+' ("mod+shift+s", "g", "delete"). `mod` is Ctrl on Windows/Linux and Cmd on macOS, as in the old hand-written handlers.
// Users only store overrides (useHotkeyStore), so a default added later reaches everyone who never changed that shortcut.

export type HotkeyScope = 'global' | 'mapGrid'

/** Heading in the settings dialog (locale key hotkeys.groups.<group>). */
export type HotkeyGroup = 'app' | 'mapEdit' | 'mapClipboard' | 'mapTools'

/** The action's name in the settings dialog is the locale key hotkeys.actions.<id>, unless `labelKey` points at an existing label. */
export interface HotkeyDef {
  id: string
  scope: HotkeyScope
  group: HotkeyGroup
  /** '' = unbound until the user picks a key. */
  defaultCombo: string
  /** Locale key of the name when the action already has one elsewhere (the Map Grid tool labels). */
  labelKey?: string
  /** Id of the native menu item that carries this shortcut on the desktop build (src-tauri/src/lib.rs build_menu). There the menu
   *  accelerator fires and the page handler stays quiet, so one press never runs twice. */
  nativeMenuId?: string
}

/** A Map Grid tool button: its idle ToolButton carries data-hotkey-tool=<id> and the shortcut presses it. Unbound by default (no key is free for all of them). */
const gridTool = (id: string, labelKey: string): HotkeyDef => ({ id, scope: 'mapGrid', group: 'mapTools', defaultCombo: '', labelKey })

export const HOTKEY_DEFS: readonly HotkeyDef[] = [
  { id: 'viewMap', scope: 'global', group: 'app', defaultCombo: 'g' },
  { id: 'viewQuests', scope: 'global', group: 'app', defaultCombo: 'q' },
  { id: 'newMap', scope: 'global', group: 'app', defaultCombo: 'mod+alt+n' },
  { id: 'openMap', scope: 'global', group: 'app', defaultCombo: 'mod+alt+o', nativeMenuId: 'open-map' },
  { id: 'randomMap', scope: 'global', group: 'app', defaultCombo: 'mod+alt+r' },
  { id: 'newScenario', scope: 'global', group: 'app', defaultCombo: 'mod+n', nativeMenuId: 'new' },
  { id: 'openScenario', scope: 'global', group: 'app', defaultCombo: 'mod+o', nativeMenuId: 'open' },
  { id: 'save', scope: 'global', group: 'app', defaultCombo: 'mod+s', nativeMenuId: 'save' },
  { id: 'saveAs', scope: 'global', group: 'app', defaultCombo: 'mod+shift+s', nativeMenuId: 'save-as' },
  { id: 'undo', scope: 'global', group: 'app', defaultCombo: 'mod+z', nativeMenuId: 'undo' },
  { id: 'redo', scope: 'global', group: 'app', defaultCombo: 'mod+shift+z', nativeMenuId: 'redo' },
  { id: 'redoAlt', scope: 'global', group: 'app', defaultCombo: 'mod+y' },
  { id: 'commandPalette', scope: 'global', group: 'app', defaultCombo: 'mod+k' },
  { id: 'quit', scope: 'global', group: 'app', defaultCombo: 'mod+q', nativeMenuId: 'quit' },
  { id: 'gridUndo', scope: 'mapGrid', group: 'mapEdit', defaultCombo: 'mod+z' },
  { id: 'gridRedo', scope: 'mapGrid', group: 'mapEdit', defaultCombo: 'mod+shift+z' },
  { id: 'gridRedoAlt', scope: 'mapGrid', group: 'mapEdit', defaultCombo: 'mod+y' },
  { id: 'gridDelete', scope: 'mapGrid', group: 'mapEdit', defaultCombo: 'delete' },
  { id: 'gridDeleteAlt', scope: 'mapGrid', group: 'mapEdit', defaultCombo: 'backspace' },
  { id: 'gridCopy', scope: 'mapGrid', group: 'mapClipboard', defaultCombo: 'mod+c' },
  { id: 'gridPaste', scope: 'mapGrid', group: 'mapClipboard', defaultCombo: 'mod+v' },
  { id: 'gridFlip', scope: 'mapGrid', group: 'mapClipboard', defaultCombo: 'm' },
  { id: 'gridRotate', scope: 'mapGrid', group: 'mapClipboard', defaultCombo: 'r' },
  gridTool('toolTerrain', 'mapGrid.mapGridDialog.terrain'),
  gridTool('toolObjects', 'shared.objects'),
  gridTool('toolSpawner', 'shared.spawner'),
  gridTool('toolHero', 'common.statsDialog.hero'),
  gridTool('toolLandmark', 'mapGrid.mapGridDialog.landmark'),
  gridTool('toolEncounter', 'mapGrid.mapGridDialog.encounter'),
  gridTool('toolResource', 'mapGrid.mapGridDialog.resource'),
  gridTool('toolLevel', 'mapGrid.mapGridDialog.level'),
  gridTool('toolRamp', 'mapGrid.mapGridDialog.ramp'),
  gridTool('toolWater', 'common.generateRandomMapDialog.water'),
  gridTool('toolRiver', 'mapGrid.mapGridDialog.river'),
  gridTool('toolRoad', 'mapGrid.mapGridDialog.road'),
  gridTool('toolObstacles', 'common.templateDetailsDialog.obstacles'),
  gridTool('toolTrees', 'mapGrid.mapGridDialog.trees'),
  gridTool('toolWalkables', 'mapGrid.mapGridDialog.walkables'),
  gridTool('toolPlayerAreas', 'mapGrid.mapGridDialog.playerAreas'),
  gridTool('toolEraser', 'mapGrid.mapGridDialog.eraser'),
  gridTool('toolSelect', 'mapGrid.mapGridDialog.copy.select'),
]

const DEF_BY_ID = new Map(HOTKEY_DEFS.map((d) => [d.id, d]))

export function hotkeyDef(id: string): HotkeyDef | undefined {
  return DEF_BY_ID.get(id)
}

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta', 'altgraph'])

/** The combo a key event stands for, or null for a bare modifier press. */
export function comboFromEvent(e: KeyboardEvent): string | null {
  const raw = e.key.toLowerCase()
  if (MODIFIER_KEYS.has(raw)) return null
  // With Alt held, macOS types a different character ("˜" for Alt+N), so fall back to the physical key for letters and digits.
  let key = raw
  if (e.altKey) {
    if (e.code.startsWith('Key')) key = e.code.slice(3).toLowerCase()
    else if (e.code.startsWith('Digit')) key = e.code.slice(5)
  }
  if (key === ' ') key = 'space'
  else if (key === '+') key = 'plus'
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('mod')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

const IS_MAC = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

const KEY_LABELS: Record<string, string> = {
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', escape: 'Esc', delete: 'Del', backspace: 'Backspace', space: 'Space', plus: '+',
}

/** "mod+shift+s" -> "Ctrl+Shift+S" (⌘⇧S on macOS). Empty combo -> "". */
export function comboLabel(combo: string): string {
  if (!combo) return ''
  const parts = combo.split('+')
  const key = parts[parts.length - 1]
  const keyText = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1))
  const mods = parts.slice(0, -1).map((m) => (IS_MAC ? { mod: '⌘', alt: '⌥', shift: '⇧' }[m] : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' }[m]) ?? m)
  return IS_MAC ? mods.join('') + keyText : [...mods, keyText].join('+')
}

const ACCELERATOR_KEYS: Record<string, string> = {
  delete: 'Delete', backspace: 'Backspace', space: 'Space', escape: 'Escape', plus: 'Plus',
  arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right',
}

/** The combo in the native menu's accelerator syntax ("CmdOrCtrl+Shift+S"), or '' when the key has no accelerator spelling. */
export function comboToAccelerator(combo: string): string {
  if (!combo) return ''
  const parts = combo.split('+')
  const key = parts[parts.length - 1]
  const keyText = ACCELERATOR_KEYS[key] ?? (key.length === 1 ? key.toUpperCase() : /^f\d{1,2}$/.test(key) ? key.toUpperCase() : '')
  if (!keyText) return ''
  const mods = parts.slice(0, -1).map((m) => ({ mod: 'CmdOrCtrl', alt: 'Alt', shift: 'Shift' }[m] ?? ''))
  return [...mods, keyText].join('+')
}

/** Combos the editor or the browser needs for itself: Esc ends every tool, the rest would close, reload or leave the page. */
const RESERVED_COMBOS = new Set(['escape', 'mod+w', 'mod+t', 'mod+shift+t', 'mod+r', 'mod+shift+r', 'mod+l', 'f5', 'f11', 'f12', 'alt+f4', 'mod+tab'])

export function isReservedCombo(combo: string): boolean {
  return RESERVED_COMBOS.has(combo)
}

/** Well-formed combo: no empty parts. */
export function isValidCombo(combo: string): boolean {
  return combo.length > 0 && combo.split('+').every(Boolean)
}
