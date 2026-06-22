import JSZip from 'jszip'
import type { DialogFlow } from '@/types/dialog'

/** UTF-8 BOM required by the game's localization loader */
const BOM = '\uFEFF'

/**
 * Build and download (or save via Tauri) a distributable map ZIP.
 *
 * ZIP structure:
 *   DB/dialogs/dialogs/custom_maps/{mapName}/{dialogId}.json  (one per dialog)
 *   Lang/english/texts/customMaps.json
 */
export async function exportMapZip(
  mapName: string,
  dialogs: Record<string, DialogFlow>,
  localization: Record<string, string>,
): Promise<void> {
  if (!mapName.trim()) {
    throw new Error('Map name is required to export a ZIP.')
  }

  const zip = new JSZip()

  // ── Dialog files ───────────────────────────────────────────────────────────
  const dialogBase = `DB/dialogs/dialogs/custom_maps/${mapName}`
  for (const [id, flow] of Object.entries(dialogs)) {
    const fileContent = JSON.stringify({ array: [flow] }, null, '\t')
    zip.file(`${dialogBase}/${id}.json`, fileContent)
  }

  // ── Localization file ──────────────────────────────────────────────────────
  // Collect all SIDs referenced by dialogs + those already in the localization map
  const allSids = new Set<string>(Object.keys(localization))
  for (const flow of Object.values(dialogs)) {
    for (const slide of flow.slides) {
      if (slide.text) allSids.add(slide.text)
      if (slide.answers) {
        for (const answer of slide.answers) {
          if (answer.text) allSids.add(answer.text)
        }
      }
    }
  }

  const tokens = Array.from(allSids).map((sid) => ({
    sid,
    text: localization[sid] ?? '',
  }))

  const locContent = BOM + JSON.stringify({ tokens }, null, '\t')
  zip.file('Lang/english/texts/customMaps.json', locContent)

  // ── Download / save ────────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob' })
  const safeName = mapName.replace(/\s+/g, '_').toLowerCase()
  const filename = `${safeName}.zip`

  // Check for Tauri at runtime — dynamic import avoids bundling issues
  if ('__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const savePath = await save({
      defaultPath: filename,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    })
    if (!savePath) return
    const arrayBuffer = await blob.arrayBuffer()
    await writeFile(savePath, new Uint8Array(arrayBuffer))
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
