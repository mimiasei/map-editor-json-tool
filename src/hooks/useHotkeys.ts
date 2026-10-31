import { useEffect, useRef } from 'react'
import { HOTKEY_DEFS, comboFromEvent, type HotkeyScope } from '@/lib/hotkeys'
import { effectiveCombo, useHotkeyStore } from '@/store/useHotkeyStore'
import { isTauri } from '@/lib/native-fs'

/** A handler returns false when it did nothing, so the browser's own behaviour for the key is kept. */
export type HotkeyHandler = () => boolean | void

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null
  if (!node) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName) || node.isContentEditable
}

/**
 * Runs `handlers` (by hotkey id) on matching key presses. Skipped while typing in a field, and global shortcuts without Ctrl/Cmd/Alt are also
 * skipped while a dialog, list or menu is open. On the desktop build a shortcut that has a native menu item is left to that menu's accelerator.
 */
export function useHotkeys(scope: HotkeyScope, handlers: Record<string, HotkeyHandler>, enabled = true): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const overrides = useHotkeyStore((s) => s.overrides)

  useEffect(() => {
    if (!enabled) return
    const native = isTauri()
    const handler = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e)
      if (!combo) return
      const def = HOTKEY_DEFS.find((d) => d.scope === scope && handlersRef.current[d.id] && effectiveCombo(overrides, d.id) === combo)
      if (!def) return
      if (native && def.nativeMenuId) return
      if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return
      if (scope === 'global' && !/^(mod|alt)\+/.test(combo) && document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]')) return
      if (handlersRef.current[def.id]() === false) return
      e.preventDefault()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [scope, overrides, enabled])
}
