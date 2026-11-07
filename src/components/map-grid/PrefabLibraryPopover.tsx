// ─── Map Grid — prefab library popover ─────────────────────────────────────────
// Save the copied area under a name, paste a saved one later (also in another map), share them as a JSON file. See lib/map-grid/prefab-library.ts.

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BookOpen, ClipboardPaste, Download, Trash2, Upload } from '@/components/ui/icons'
import { usePrefabStore } from '@/store/usePrefabStore'
import { parsePrefabFile, serializePrefabs, usableClip, type Prefab } from '@/lib/map-grid/prefab-library'
import type { ObjectClipboard } from '@/lib/map-grid/clipboard'
import { openFile, saveFile } from '@/lib/native-fs'
import { logError } from '@/lib/logger'

interface Props {
  /** The current copy, offered for saving. */
  clipboard: ObjectClipboard | null
  /** Whether the loaded game data knows this object (squads are always accepted). */
  knowsSid: (sid: string, type: 0 | 2) => boolean
  /** Puts a prefab's clip on the clipboard and starts pasting it. */
  onUse: (clip: ObjectClipboard, note: string | null) => void
}

export default function PrefabLibraryPopover({ clipboard, knowsSid, onUse }: Props) {
  const { t } = useTranslation()
  const prefabs = usePrefabStore((s) => s.prefabs)
  const add = usePrefabStore((s) => s.add)
  const remove = usePrefabStore((s) => s.remove)
  const addMany = usePrefabStore((s) => s.addMany)
  const [name, setName] = useState('')
  const [note, setNote] = useState<string | null>(null)

  const save = () => {
    if (!clipboard) return
    add(name || t('mapGrid.mapGridDialog.library.defaultName', { n: prefabs.length + 1 }), clipboard)
    setName('')
    setNote(t('mapGrid.mapGridDialog.library.saved'))
  }

  const use = (prefab: Prefab) => {
    const { clip, dropped } = usableClip(prefab.clip, knowsSid)
    if (!clip) { setNote(t('mapGrid.mapGridDialog.library.nothingUsable')); return }
    onUse(clip, dropped > 0 ? t('mapGrid.mapGridDialog.library.dropped', { count: dropped }) : null)
  }

  const exportAll = async () => {
    try {
      await saveFile(serializePrefabs(prefabs), 'tse-prefabs.json')
    } catch (e) {
      logError(`Failed to export prefabs: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const importFile = async () => {
    try {
      const file = await openFile()
      if (!file) return
      const imported = parsePrefabFile(file.content)
      if (!imported || imported.length === 0) { setNote(t('mapGrid.mapGridDialog.library.importFailed')); return }
      addMany(imported)
      setNote(t('mapGrid.mapGridDialog.library.imported', { count: imported.length }))
    } catch (e) {
      logError(`Failed to import prefabs: ${e instanceof Error ? e.message : String(e)}`)
      setNote(t('mapGrid.mapGridDialog.library.importFailed'))
    }
  }

  return (
    <Popover onOpenChange={(o) => { if (!o) setNote(null) }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6" title={`${t('mapGrid.mapGridDialog.library.title')}: ${t('mapGrid.mapGridDialog.library.titleHint')}`}>
          <BookOpen className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-2" data-nodrag>
        <div className="flex items-center gap-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            placeholder={t('mapGrid.mapGridDialog.library.namePlaceholder')}
            className="h-7 text-xs"
          />
          <Button size="sm" className="h-7 text-xs" disabled={!clipboard} onClick={save} title={clipboard ? undefined : t('mapGrid.mapGridDialog.library.copyFirst')}>
            {t('mapGrid.mapGridDialog.library.save')}
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded border border-border">
          {prefabs.length === 0 && <p className="p-3 text-xs text-muted-foreground">{t('mapGrid.mapGridDialog.library.empty')}</p>}
          {prefabs.map((p) => (
            <div key={p.id} className="flex items-center gap-1 border-b border-border px-2 py-1.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">{t('mapGrid.mapGridDialog.library.size', { count: p.clip.items.length, width: p.clip.width, height: p.clip.height })}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => use(p)} title={t('mapGrid.mapGridDialog.library.use')}>
                <ClipboardPaste className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove(p.id)} title={t('mapGrid.mapGridDialog.library.delete')}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => void importFile()}>
            <Upload className="h-3.5 w-3.5" />
            {t('mapGrid.mapGridDialog.library.import')}
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={prefabs.length === 0} onClick={() => void exportAll()}>
            <Download className="h-3.5 w-3.5" />
            {t('mapGrid.mapGridDialog.library.export')}
          </Button>
          {note && <span className="ml-1 text-xs text-muted-foreground">{note}</span>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
