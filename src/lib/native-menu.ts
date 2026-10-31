// ─── Native menu bar language ────────────────────────────────────────────────
// The File/Edit/Help menu is built in Rust (src-tauri/src/lib.rs). It starts in English; this sends it the UI-language labels,
// keyed by menu id, and redraws the Open Recent entries (they are rebuilt with the menu). The ids are what AppShell switches on.

import i18n from '@/lib/i18n'
import { isTauri } from '@/lib/native-fs'
import { syncRecentMenu } from '@/lib/recent-files'
import { HOTKEY_DEFS, comboToAccelerator } from '@/lib/hotkeys'
import { effectiveCombo, useHotkeyStore } from '@/store/useHotkeyStore'

function menuLabels(): Record<string, string> {
  const t = i18n.t.bind(i18n)
  return {
    file: t('nativeMenu.file'),
    edit: t('nativeMenu.edit'),
    help: t('nativeMenu.help'),
    new: t('nativeMenu.new'),
    open: t('nativeMenu.open'),
    'open-map': t('nativeMenu.openMap'),
    recent: t('nativeMenu.recent'),
    'import-h3m': t('nativeMenu.importH3m'),
    save: t('nativeMenu.save'),
    'save-as': t('nativeMenu.saveAs'),
    quit: t('nativeMenu.quit'),
    undo: t('nativeMenu.undo'),
    redo: t('nativeMenu.redo'),
    'whats-new': t('nativeMenu.whatsNew'),
    about: t('nativeMenu.about'),
    'check-updates': t('nativeMenu.checkUpdates'),
    'recent-none': t('nativeMenu.recentNone'),
    'clear-recent': t('nativeMenu.clearRecent'),
    ...menuAccelerators(),
  }
}

/** The configurable shortcuts of the menu items, sent as 'accel:<menu id>' (empty = none) next to the labels. */
function menuAccelerators(): Record<string, string> {
  const { overrides } = useHotkeyStore.getState()
  const out: Record<string, string> = {}
  for (const def of HOTKEY_DEFS) {
    if (def.nativeMenuId) out[`accel:${def.nativeMenuId}`] = comboToAccelerator(effectiveCombo(overrides, def.id))
  }
  return out
}

/** Rebuilds the native menu in the current UI language. Desktop only; a failure leaves the previous menu in place. */
export async function syncNativeMenu(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_menu_labels', { labels: menuLabels() })
  } catch {
    return
  }
  syncRecentMenu()
}
