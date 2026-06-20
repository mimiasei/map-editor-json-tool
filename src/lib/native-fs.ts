// ─── Native file system abstraction ─────────────────────────────────────────
// Provides a unified API for file I/O that works in both the browser (GitHub
// Pages) and inside the Tauri desktop wrapper. Import only from this module —
// never import @tauri-apps/plugin-* directly in UI components.

/** True when running inside the Tauri desktop wrapper. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// ─── Open ─────────────────────────────────────────────────────────────────────

/**
 * Open a JSON file. Shows a native dialog in Tauri, or an invisible <input>
 * element in the browser. Returns null if the user cancels.
 */
export async function openFile(): Promise<{
  name: string
  path: string
  content: string
} | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!selected || typeof selected !== 'string') return null
    const content = await readTextFile(selected)
    const name = selected.replace(/\\/g, '/').split('/').pop() ?? selected
    return { name, path: selected, content }
  }

  // Browser: hidden <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.addEventListener('cancel', () => resolve(null), { once: true })
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = (e) => {
        resolve({ name: file.name, path: '', content: e.target?.result as string })
      }
      reader.readAsText(file)
    }
    input.click()
  })
}

// ─── Save to path (Ctrl+S) ────────────────────────────────────────────────────

/**
 * Write content directly to an already-known file path.
 * Tauri only — call this for Ctrl+S when a file is already open.
 */
export async function saveToPath(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  await writeTextFile(path, content)
}

// ─── Save As ──────────────────────────────────────────────────────────────────

/**
 * Save As: shows a native save dialog (Tauri) or triggers a browser download.
 * Returns the saved file path in Tauri, null in browser or on cancel.
 */
export async function saveFile(
  content: string,
  suggestedName = 'scenario.json',
): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const path = await save({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      defaultPath: suggestedName,
    })
    if (!path) return null
    await writeTextFile(path, content)
    return path
  }

  // Browser: trigger download
  const blob = new Blob([content], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = suggestedName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return null
}

// ─── Native confirm dialog ────────────────────────────────────────────────────

/**
 * Show a yes/no confirmation dialog. Uses Tauri's native dialog in desktop
 * mode (avoids `window.confirm` which Tauri blocks), falls back to
 * `window.confirm` in browser.
 */
export async function confirmDialog(message: string, title?: string): Promise<boolean> {
  if (isTauri()) {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    return confirm(message, { title, kind: 'warning' })
  }
  return window.confirm(title ? `${title}\n\n${message}` : message)
}
