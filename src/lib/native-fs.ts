// ─── Native file system abstraction ─────────────────────────────────────────
// Provides a unified API for file I/O that works in both the browser (GitHub
// Pages) and inside the Tauri desktop wrapper. Import only from this module —
// never import @tauri-apps/plugin-* directly in UI components.

import { logInfo } from '@/lib/logger'

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
    logInfo(`Opened: ${name}`)
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
  logInfo(`Saved: ${path}`)
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
    logInfo(`Saved as: ${path}`)
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

// ─── Open .map file (binary) ──────────────────────────────────────────────────

/**
 * Open a .map file. Shows a native dialog in Tauri, or an invisible <input>
 * in the browser. Returns null if the user cancels.
 */
export async function openMapFile(): Promise<{
  name: string
  path: string
  buffer: ArrayBuffer
} | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Map', extensions: ['map'] }],
    })
    if (!selected || typeof selected !== 'string') return null
    const bytes = await readFile(selected)
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const name = selected.replace(/\\/g, '/').split('/').pop() ?? selected
    logInfo(`Opened map: ${name}`)
    return { name, path: selected, buffer }
  }

  // Browser: hidden <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.map'
    input.addEventListener('cancel', () => {
      console.log('[native-fs] openMapFile: file picker cancelled')
      resolve(null)
    }, { once: true })
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        console.log('[native-fs] openMapFile: no file selected')
        resolve(null)
        return
      }
      console.log('[native-fs] openMapFile: reading file', file.name, 'size=', file.size)
      const reader = new FileReader()
      reader.onload = (e) => {
        console.log('[native-fs] openMapFile: FileReader loaded, byteLength=', (e.target?.result as ArrayBuffer)?.byteLength)
        resolve({ name: file.name, path: '', buffer: e.target?.result as ArrayBuffer })
      }
      reader.onerror = (e) => {
        console.error('[native-fs] openMapFile: FileReader error', e)
        resolve(null)
      }
      reader.readAsArrayBuffer(file)
    }
    input.click()
  })
}

// ─── Read a binary file by path (Tauri only) ──────────────────────────────────

/**
 * Read a file as an ArrayBuffer from an absolute path.
 * Returns null in browser or if the file doesn't exist.
 */
export async function readBinaryFile(path: string): Promise<ArrayBuffer | null> {
  if (!isTauri()) return null
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const bytes = await readFile(path)
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

// ─── Check if a file exists (Tauri only) ──────────────────────────────────────

/**
 * Returns true if the given path exists (Tauri only, always false in browser).
 */
export async function checkFileExists(path: string): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return exists(path)
  } catch {
    return false
  }
}

// ─── Read a text file at an absolute path (Tauri only) ───────────────────────

/**
 * Read a UTF-8 text file from an absolute path.
 * Returns null in browser or if the read fails.
 */
export async function readTextFileAt(path: string): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return await readTextFile(path)
  } catch {
    return null
  }
}

// ─── Pick Core.zip ────────────────────────────────────────────────────────────

/**
 * Open a native file picker for Core.zip (Tauri only).
 * Returns the selected file path, or null if the user cancelled or on web.
 */
export async function pickCoreZip(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({
    title: 'Select Core.zip',
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  return typeof path === 'string' ? path : null
}
