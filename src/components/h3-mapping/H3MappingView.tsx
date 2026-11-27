// ─── H3 Object Mapping ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A full-pane view (like Map Grid) over what the H3 import does. Three tabs:
//  - Objects: the table that decides what every H3 object becomes in OE (h3-object-mapping.json). The inspector edits the selected row: leave it out,
//    convert it to one OE object, a random mix of OE objects, or a scenery role. Rows that depend on the sprite, subtype or terrain ("rules") show a
//    summary and are edited as JSON.
//  - Sprite rules: patterns on the sprite file name that turn matching objects into random mixes (cacti, palms, jungle, dunes), checked before the rows.
//  - Settings: the converter's tuning numbers.
// Edits are kept in useH3MappingStore (localStorage), apply to the next import (they travel with the import job to its worker), and can be exported
// as a full table.

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download, Pencil, Save, Search, Undo2, Upload, X } from '@/components/ui/icons'
import EntityCombobox from '@/components/common/EntityCombobox'
import MixEditor from './MixEditor'
import SpriteRulesTab from './SpriteRulesTab'
import SettingsTab from './SettingsTab'
import RolesTab from './RolesTab'
import MixingTab from './MixingTab'
import { useCatalogStore } from '@/store/useCatalogStore'
import { useH3MappingStore } from '@/store/useH3MappingStore'
import { DEFAULT_MAPPING_ROWS, DEFAULT_DECORATION_RULES, DEFAULT_SETTINGS, DEFAULT_SPRITE_RULES, SCENERY_ROLE_SIDS } from '@/lib/h3-import/h3-object-mapping'
import { OBJECT_KINDS, SCENERY_ROLES, SQUAD_FRACTIONS, type MixEntry, type ObjectKind, type ObjectRow, type SceneryRole } from '@/lib/h3-import/h3-object-mapping-schema'
import { H3_TOWNS, USER_REASON, convertsToText, subtypeRows, subtypeSid, type SubtypeRowInfo, objectGroup, parseRowJson, rowKind, sameRow, toEmit, toMix, toOmit, toScenery, type ObjectGroup, type RowKind } from '@/lib/h3-import/mapping-edit'
import { getH3ObjectDescription } from '@/lib/h3-import/h3-object-descriptions'
import mappingData from '@/lib/h3-import/h3-object-mapping.json'
import { confirmDialog, isTauri, openFile, saveFile } from '@/lib/native-fs'
import { loadMappingEditsFile, saveMappingEditsFile } from '@/lib/h3-import/mapping-edits-file'
import { cn } from '@/lib/utils'

type KindFilter = 'all' | RowKind
type Tab = 'objects' | 'rules' | 'roles' | 'mixing' | 'settings'

const GROUP_FILTERS: ('all' | ObjectGroup)[] = ['all', 'interactive', 'scenery', 'unknown']
const GROUP_BY_ID = new Map(DEFAULT_MAPPING_ROWS.map((row) => [row.h3Id, objectGroup(row)]))
const KIND_FILTERS: KindFilter[] = ['all', 'omit', 'emit', 'mix', 'scenery', 'rule']
const TABS: Tab[] = ['objects', 'rules', 'roles', 'mixing', 'settings']

const KIND_BADGE: Record<RowKind, string> = {
  omit: 'bg-muted text-muted-foreground',
  emit: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  mix: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  scenery: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  rule: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
}

const DEFAULT_BY_ID = new Map<number, ObjectRow>(DEFAULT_MAPPING_ROWS.map((row) => [row.h3Id, row]))

/** The whole role table: the shipped sids with the edited cells on top (what an exported table lists). */
function mergedRoleSids(edited: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(SCENERY_ROLE_SIDS).map(([role, cells]) => [role, { ...cells, ...edited[role] }]))
}

/** The role cells and borrowing rules of an imported table that differ from the shipped ones (a full table lists them all). */
function importedExtras(parsed: unknown): { sceneryRoleSids: unknown; decorationRules: unknown } {
  const table = (Array.isArray(parsed) ? {} : parsed) as { sceneryRoleSids?: Record<string, Record<string, unknown>>; decorationRules?: unknown }
  const cells: Record<string, Record<string, unknown>> = {}
  for (const [role, byBiome] of Object.entries(table.sceneryRoleSids ?? {})) {
    for (const [biome, sid] of Object.entries(byBiome ?? {})) {
      if (SCENERY_ROLE_SIDS[role]?.[biome] !== sid) (cells[role] ??= {})[biome] = sid
    }
  }
  const sameRules = JSON.stringify(table.decorationRules) === JSON.stringify(DEFAULT_DECORATION_RULES)
  return { sceneryRoleSids: cells, decorationRules: sameRules ? null : table.decorationRules }
}

export default function H3MappingView({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const edits = useH3MappingStore((s) => s.edits)
  const catalog = useCatalogStore((s) => s.catalog)
  const [tab, setTab] = useState<Tab>('objects')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [groupFilter, setGroupFilter] = useState<'all' | ObjectGroup>('all')
  const [modifiedOnly, setModifiedOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  /** With a row that lists one row per town (Random Dwelling Faction), the town row selected under it. */
  const [selectedSub, setSelectedSub] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const overrides = edits.rows
  const rows = useMemo(() => DEFAULT_MAPPING_ROWS.map((row) => overrides[String(row.h3Id)] ?? row), [overrides])
  const nameBySid = useMemo(() => new Map((catalog?.mapObjects ?? []).map((o) => [o.id, o.name])), [catalog])
  const modifiedRows = Object.keys(overrides).length
  const editCount = modifiedRows + (edits.spriteRules ? 1 : 0) + Object.keys(edits.settings).length + Object.keys(edits.sceneryRoleSids).length + (edits.decorationRules ? 1 : 0)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (kindFilter !== 'all' && rowKind(row) !== kindFilter) return false
      if (groupFilter !== 'all' && GROUP_BY_ID.get(row.h3Id) !== groupFilter) return false
      if (modifiedOnly && !overrides[String(row.h3Id)]) return false
      if (!q) return true
      return `${row.h3Id} ${row.h3Name} ${convertsToText(row)} ${nameBySid.get(row.outcome === 'emit' ? row.sid : '') ?? ''}`.toLowerCase().includes(q)
    })
  }, [rows, query, kindFilter, groupFilter, modifiedOnly, overrides, nameBySid])

  const selected = selectedId === null ? null : rows.find((row) => row.h3Id === selectedId) ?? null

  const exportTable = async () => {
    const table = { ...mappingData, objects: rows, spriteRules: edits.spriteRules ?? DEFAULT_SPRITE_RULES, settings: { ...DEFAULT_SETTINGS, ...edits.settings }, decorationRules: edits.decorationRules ?? DEFAULT_DECORATION_RULES, sceneryRoleSids: mergedRoleSids(edits.sceneryRoleSids) }
    const path = await saveFile(JSON.stringify(table, null, 2) + '\n', 'h3-object-mapping.json')
    if (path) setNotice(t('h3Mapping.exported'))
  }

  const importTable = async () => {
    const file = await openFile()
    if (!file) return
    try {
      const parsed = JSON.parse(file.content) as { objects?: unknown[]; spriteRules?: unknown; settings?: unknown; decorationRules?: unknown; sceneryRoleSids?: unknown } | unknown[]
      const list = Array.isArray(parsed) ? parsed : parsed.objects
      if (!Array.isArray(list)) throw new Error('no objects array')
      // A full table lists every row: only the ones that differ from the shipped table are edits; the same goes for the rules and the numbers.
      const changed = list.filter((raw) => {
        const id = (raw as { h3Id?: number }).h3Id
        const base = typeof id === 'number' ? DEFAULT_BY_ID.get(id) : undefined
        return base !== undefined && JSON.stringify(base) !== JSON.stringify(raw)
      })
      const rules = !Array.isArray(parsed) && JSON.stringify(parsed.spriteRules) !== JSON.stringify(DEFAULT_SPRITE_RULES) ? parsed.spriteRules : null
      const settings = Array.isArray(parsed) || typeof parsed.settings !== 'object' || parsed.settings === null
        ? {}
        : Object.fromEntries(Object.entries(parsed.settings).filter(([key, value]) => DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] !== value))
      setNotice(t('h3Mapping.imported', { count: useH3MappingStore.getState().importEdits(changed, rules, settings, importedExtras(parsed)) }))
    } catch (error) {
      setNotice(t('h3Mapping.importFailed', { error: error instanceof Error ? error.message : String(error) }))
    }
  }

  const saveToDataFolder = async () => {
    try {
      setNotice(t('h3Mapping.saved', { path: await saveMappingEditsFile(useH3MappingStore.getState().edits) }))
    } catch (error) {
      setNotice(t('h3Mapping.saveFailed', { error: error instanceof Error ? error.message : String(error) }))
    }
  }

  const loadFromDataFolder = async () => {
    const taken = await loadMappingEditsFile()
    setNotice(taken === null ? t('h3Mapping.noSavedFile') : t('h3Mapping.loadedSaved', { count: taken }))
  }

  const resetAll = async () => {
    if (editCount === 0) return
    if (await confirmDialog(t('h3Mapping.resetAllConfirm', { count: editCount }), t('h3Mapping.title'))) useH3MappingStore.getState().clearAll()
  }

  const renderSubtypeRow = (row: ObjectRow, { subtype, label }: SubtypeRowInfo) => {
    const defaultRow = DEFAULT_BY_ID.get(row.h3Id)
    // A Random Dwelling Faction row converts to a faction per town; a Creature Bank row to an OE object per bank.
    const faction = (row.outcome === 'emit' && (row.fractionBySubtype?.[String(subtype)] ?? row.fraction)) || ''
    const defaultFaction = (defaultRow?.outcome === 'emit' && (defaultRow.fractionBySubtype?.[String(subtype)] ?? defaultRow.fraction)) || ''
    const sid = subtypeSid(row, subtype)
    const edited = row.outcome === 'emit' ? faction !== defaultFaction : defaultRow ? sid !== subtypeSid(defaultRow, subtype) : false
    const converts = row.outcome === 'emit' ? `${row.sid} (${faction || t('h3Mapping.inspector.squadAny')})` : sid || '-'
    const oeName = row.outcome === 'dispatch' ? nameBySid.get(sid) : undefined
    return (
      <tr
        key={`${row.h3Id}.${subtype}`}
        onClick={() => { setSelectedId(row.h3Id); setSelectedSub(subtype) }}
        className={cn('cursor-pointer border-t border-border/60 hover:bg-accent/50', selectedId === row.h3Id && selectedSub === subtype && 'bg-accent')}
      >
        <td className="px-2 py-1 text-center">{edited && <span className="inline-block h-2 w-2 rounded-full bg-primary" title={t('h3Mapping.edited')} />}</td>
        <td className="px-2 py-1 tabular-nums text-muted-foreground">{`${row.h3Id}.${subtype}`}</td>
        <td className="truncate px-2 py-1 pl-5">{`${row.h3Name}: ${label}`}</td>
        <td className="px-2 py-1"><span className={cn('rounded px-1.5 py-0.5', KIND_BADGE.emit)}>{t('h3Mapping.type.emit')}</span></td>
        <td className="truncate px-2 py-1 font-mono">
          {converts}
          {oeName && oeName !== sid && <span className="ml-2 font-sans text-muted-foreground">{oeName}</span>}
        </td>
      </tr>
    )
  }

  const renderObjectRow = (row: ObjectRow) => {
    const kind = rowKind(row)
    const edited = !!overrides[String(row.h3Id)]
    const oeName = row.outcome === 'emit' ? nameBySid.get(row.sid) : undefined
    return (
      <tr
        key={row.h3Id}
        onClick={() => { setSelectedId(row.h3Id); setSelectedSub(null) }}
        className={cn('cursor-pointer border-t border-border/60 hover:bg-accent/50', selectedId === row.h3Id && selectedSub === null && 'bg-accent')}
      >
        <td className="px-2 py-1 text-center">{edited && <span className="inline-block h-2 w-2 rounded-full bg-primary" title={t('h3Mapping.edited')} />}</td>
        <td className="px-2 py-1 tabular-nums text-muted-foreground">{row.h3Id}</td>
        <td className="truncate px-2 py-1" title={getH3ObjectDescription(row.h3Id)?.description}>{row.h3Name}</td>
        <td className="px-2 py-1"><span className={cn('rounded px-1.5 py-0.5', KIND_BADGE[kind])}>{t(`h3Mapping.type.${kind}`)}</span></td>
        <td className={cn('truncate px-2 py-1 font-mono', kind === 'omit' && 'text-muted-foreground')}>
          {convertsToText(row)}
          {oeName && oeName !== (row.outcome === 'emit' ? row.sid : '') && <span className="ml-2 font-sans text-muted-foreground">{oeName}</span>}
        </td>
      </tr>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="mr-2">
          <h2 className="text-sm font-semibold">{t('h3Mapping.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('h3Mapping.subtitle')}</p>
        </div>
        <div className="flex rounded-md border border-border p-0.5">
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn('rounded px-2.5 py-1 text-xs', tab === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {t(`h3Mapping.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab !== 'settings' && (
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('h3Mapping.search')} className="h-8 pl-7 pr-7 text-xs" />
            {query && (
              <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setQuery('')} aria-label={t('mapGrid.objectBrowserPanel.clearSearch')}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
        {tab === 'objects' && (
          <>
            <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as 'all' | ObjectGroup)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GROUP_FILTERS.map((group) => <SelectItem key={group} value={group}>{t(`h3Mapping.group.${group}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KIND_FILTERS.map((kind) => <SelectItem key={kind} value={kind}>{t(`h3Mapping.filter.${kind}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5">
              <Switch id="h3-mapping-modified" checked={modifiedOnly} onCheckedChange={setModifiedOnly} />
              <Label htmlFor="h3-mapping-modified" className="cursor-pointer text-xs">{t('h3Mapping.modifiedOnly')}</Label>
            </div>
            <span className="text-xs text-muted-foreground">{t('h3Mapping.counts', { shown: visible.length, total: rows.length, modified: modifiedRows })}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {isTauri() && (
            <>
              <Button size="sm" className="h-8 text-xs" onClick={() => void saveToDataFolder()} title={t('h3Mapping.saveHint')}><Save className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.save')}</Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void loadFromDataFolder()} title={t('h3Mapping.loadSavedHint')}>{t('h3Mapping.loadSaved')}</Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void importTable()}><Upload className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.import')}</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void exportTable()}><Download className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.export')}</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={editCount === 0} onClick={() => void resetAll()}><Undo2 className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.resetAll')}</Button>
          <Button size="sm" className="h-8 text-xs" onClick={onClose}>{t('h3Mapping.close')}</Button>
        </div>
      </div>
      {notice && (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1 text-xs">
          <span>{notice}</span>
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)} aria-label={t('ui.close')}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {tab === 'rules' && <SpriteRulesTab query={query} />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'mixing' && <MixingTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'objects' && (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="w-6 px-2 py-1.5" />
                  <th className="w-12 px-2 py-1.5 font-medium">{t('h3Mapping.column.id')}</th>
                  <th className="w-64 px-2 py-1.5 font-medium">{t('h3Mapping.column.object')}</th>
                  <th className="w-28 px-2 py-1.5 font-medium">{t('h3Mapping.column.type')}</th>
                  <th className="px-2 py-1.5 font-medium">{t('h3Mapping.column.convertsTo')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.flatMap((row) => [renderObjectRow(row), ...subtypeRows(row).map((info) => renderSubtypeRow(row, info))])}
                {visible.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">{t('h3Mapping.noMatches')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <aside className="w-96 shrink-0 overflow-y-auto border-l border-border p-3">
            {selected && selectedSub !== null ? <SubtypeInspector key={`${selected.h3Id}.${selectedSub}`} row={selected} subtype={selectedSub} nameBySid={nameBySid} /> : selected ? <RowInspector key={selected.h3Id} row={selected} nameBySid={nameBySid} /> : <p className="text-xs text-muted-foreground">{t('h3Mapping.selectRow')}</p>}
          </aside>
        </div>
      )}
    </div>
  )
}

/** One subtype row of a row that lists them: a faction per H3 town (Random Dwelling Faction) or an OE object per bank (Creature Bank). */
function SubtypeInspector({ row, subtype, nameBySid }: { row: ObjectRow; subtype: number; nameBySid: Map<string, string> }) {
  const { t } = useTranslation()
  const setRow = useH3MappingStore((s) => s.setRow)
  const clearRow = useH3MappingStore((s) => s.clearRow)
  if (row.outcome !== 'dispatch') return <TownFactionInspector row={row} subtype={subtype} />
  const label = row.subtypeNames?.[String(subtype)] ?? String(subtype)
  const sid = subtypeSid(row, subtype)
  const change = (value: string) => {
    if (!value.trim()) return
    const next: ObjectRow = { ...row, reason: row.reason, subtypes: { ...row.subtypes, [String(subtype)]: { ...row.subtypes?.[String(subtype)], sid: value.trim() } } }
    const base = DEFAULT_BY_ID.get(row.h3Id) as ObjectRow
    if (sameRow(next, base)) clearRow(row.h3Id)
    else setRow(row.h3Id, next)
  }
  return (
    <div className="space-y-3 text-xs">
      <span className="text-sm font-semibold">{`#${row.h3Id}.${subtype} ${row.h3Name}: ${label}`}</span>
      <div className="space-y-1">
        <Label className="text-xs">{t('h3Mapping.inspector.oeObject')}</Label>
        <EntityCombobox value={sid} category="mapObject" placeholder={t('h3Mapping.inspector.pickObject')} onChange={change} />
        {sid && nameBySid.size > 0 && !nameBySid.has(sid) && <p className="text-amber-600">{t('h3Mapping.inspector.unknownSid')}</p>}
        {sid && nameBySid.get(sid) && <p className="text-muted-foreground">{nameBySid.get(sid)}</p>}
      </div>
      <p className="text-muted-foreground">{t('h3Mapping.appliesToNext')}</p>
    </div>
  )
}

/** The faction of one H3 town of a row that lists a row per town (Random Dwelling Faction): what a hire of that town's dwellings becomes. */
function TownFactionInspector({ row, subtype }: { row: ObjectRow; subtype: number }) {
  const { t } = useTranslation()
  const setRow = useH3MappingStore((s) => s.setRow)
  const clearRow = useH3MappingStore((s) => s.clearRow)
  if (row.outcome !== 'emit') return null
  const town = H3_TOWNS[subtype]
  const current = row.fractionBySubtype?.[String(subtype)] ?? row.fraction ?? ''
  const change = (value: string) => {
    const next: ObjectRow = { ...row, reason: USER_REASON, fractionBySubtype: { ...row.fractionBySubtype, [String(subtype)]: value as (typeof SQUAD_FRACTIONS)[number] } }
    const base = DEFAULT_BY_ID.get(row.h3Id) as ObjectRow
    if (sameRow(next, base)) clearRow(row.h3Id)
    else setRow(row.h3Id, next)
  }
  return (
    <div className="space-y-3 text-xs">
      <span className="text-sm font-semibold">{`#${row.h3Id}.${subtype} ${row.h3Name}: ${town}`}</span>
      <div className="space-y-1">
        <Label className="text-xs">{t('h3Mapping.inspector.townFaction', { town })}</Label>
        <Select value={current || ' '} onValueChange={(v) => change(v.trim())}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SQUAD_FRACTIONS.map((f) => <SelectItem key={f || 'any'} value={f || ' '}>{f || t('h3Mapping.inspector.squadAny')}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground">{t('h3Mapping.inspector.townHint')}</p>
      <p className="text-muted-foreground">{t('h3Mapping.appliesToNext')}</p>
    </div>
  )
}

// ─── Inspector ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function RowInspector({ row, nameBySid }: { row: ObjectRow; nameBySid: Map<string, string> }) {
  const editedRoleSids = useH3MappingStore((s) => s.edits.sceneryRoleSids)
  const { t } = useTranslation()
  const setRow = useH3MappingStore((s) => s.setRow)
  const clearRow = useH3MappingStore((s) => s.clearRow)
  const defaultRow = DEFAULT_BY_ID.get(row.h3Id) as ObjectRow
  const wiki = getH3ObjectDescription(row.h3Id)
  const edited = !sameRow(row, defaultRow)
  const kind = rowKind(row)
  const [jsonOpen, setJsonOpen] = useState(false)
  // The kind chosen in the select before a valid row exists for it (an OE object not picked yet): nothing is saved until the row is complete.
  const [pendingKind, setPendingKind] = useState<RowKind | null>(null)
  const shownKind = pendingKind ?? kind
  const lastEmit = row.outcome === 'emit' ? row : null

  const commit = (next: ObjectRow) => {
    setPendingKind(null)
    if (sameRow(next, defaultRow)) clearRow(row.h3Id)
    else setRow(row.h3Id, next)
  }

  const changeKind = (next: RowKind) => {
    if (next === kind) { setPendingKind(null); return }
    if (next === 'omit') commit(toOmit(row, ''))
    else if (next === 'scenery') commit(toScenery(row, 'ground'))
    else if (next === 'mix') commit(toMix(row, [{ sids: [], weight: 1 }]))
    else setPendingKind(next)
  }

  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{`#${row.h3Id} ${row.h3Name}`}</span>
          {edited && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{t('h3Mapping.edited')}</Badge>}
        </div>
        <p className="mt-0.5 text-muted-foreground">{t('h3Mapping.default')}: <span className="font-mono">{convertsToText(defaultRow)}</span></p>
        {wiki && (
          <p className="mt-1.5 rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
            <span className="font-medium text-foreground">{t('h3Mapping.wikiDescription')}</span>
            {(wiki.generic || wiki.titleMismatch) && <span> ({wiki.wikiTitle})</span>}
            {': '}{wiki.description}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t('h3Mapping.inspector.type')}</Label>
        {kind === 'rule' ? (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">{t('h3Mapping.inspector.ruleHint', { summary: convertsToText(row) })}</p>
        ) : (
          <Select value={shownKind} onValueChange={(v) => changeKind(v as RowKind)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['omit', 'emit', 'mix', 'scenery'] as const).map((k) => <SelectItem key={k} value={k}>{t(`h3Mapping.typeLong.${k}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {shownKind === 'emit' && kind !== 'rule' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('h3Mapping.inspector.oeObject')}</Label>
            <EntityCombobox
              value={lastEmit?.sid ?? ''}
              category="mapObject"
              placeholder={t('h3Mapping.inspector.pickObject')}
              onChange={(sid) => { if (sid.trim()) commit(toEmit(row, sid, lastEmit?.kind ?? 'interactable')) }}
            />
            {lastEmit && nameBySid.size > 0 && !nameBySid.has(lastEmit.sid) && <p className="text-amber-600">{t('h3Mapping.inspector.unknownSid')}</p>}
            {lastEmit && nameBySid.get(lastEmit.sid) && <p className="text-muted-foreground">{nameBySid.get(lastEmit.sid)}</p>}
          </div>
          {lastEmit && (
            <div className="space-y-1">
              <Label className="text-xs">{t('h3Mapping.inspector.kind')}</Label>
              <Select value={lastEmit.kind} onValueChange={(v) => commit(toEmit(row, lastEmit.sid, v as ObjectKind))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{OBJECT_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-muted-foreground">{t('h3Mapping.inspector.kindHint')}</p>
            </div>
          )}
          {(lastEmit?.sid === 'random-squad' || lastEmit?.sid === 'random-hire') && (
            lastEmit.fractionBySubtype !== undefined ? <p className="rounded-md border border-border p-2 text-muted-foreground">{t('h3Mapping.inspector.perTownHint')}</p> : (
            <div className="space-y-2 rounded-md border border-border p-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('h3Mapping.inspector.squadFraction')}</Label>
                <Select value={lastEmit.fraction || ' '} onValueChange={(v) => commit({ ...lastEmit, fraction: v.trim() as (typeof SQUAD_FRACTIONS)[number], fractionBySubtype: undefined, reason: USER_REASON })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SQUAD_FRACTIONS.map((f) => <SelectItem key={f || 'any'} value={f || ' '}>{f || t('h3Mapping.inspector.squadAny')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('h3Mapping.inspector.squadTier')}</Label>
                <Select value={String(lastEmit.tier ?? 0)} onValueChange={(v) => commit({ ...lastEmit, tier: Number(v), reason: USER_REASON })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t(lastEmit.sid === 'random-hire' ? 'h3Mapping.inspector.hireTierAuto' : 'h3Mapping.inspector.squadTierAuto')}</SelectItem>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-muted-foreground">{t(lastEmit.sid === 'random-hire' ? 'h3Mapping.inspector.hireHint' : 'h3Mapping.inspector.squadHint')}</p>
            </div>
          ))}
        </div>
      )}

      {shownKind === 'mix' && row.outcome === 'mix' && (
        <div className="space-y-1">
          <Label className="text-xs">{t('h3Mapping.inspector.mixEntries')}</Label>
          <MixEditor entries={row.entries} onChange={(entries: MixEntry[]) => commit(toMix(row, entries))} />
        </div>
      )}

      {shownKind === 'scenery' && row.outcome === 'scenery' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('h3Mapping.inspector.role')}</Label>
            <Select value={row.role} onValueChange={(v) => commit(toScenery(row, v as SceneryRole))}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{SCENERY_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="mb-1 text-muted-foreground">{t('h3Mapping.inspector.roleSids')}</p>
            <ul className="space-y-0.5 font-mono">
              {Object.entries({ ...SCENERY_ROLE_SIDS[row.role], ...editedRoleSids[row.role] }).map(([biome, sid]) => <li key={biome}><span className="text-muted-foreground">{biome}</span> → {sid}</li>)}
            </ul>
          </div>
        </div>
      )}

      {shownKind === 'omit' && row.outcome === 'omit' && (
        <div className="space-y-1">
          <Label className="text-xs">{t('h3Mapping.inspector.reason')}</Label>
          <Input defaultValue={row.reason} className="h-8 font-mono text-xs" onBlur={(e) => { if (e.target.value.trim() !== row.reason) commit(toOmit(row, e.target.value)) }} />
          <p className="text-muted-foreground">{t('h3Mapping.inspector.reasonHint')}</p>
        </div>
      )}

      {pendingKind === 'emit' && <p className="text-muted-foreground">{t('h3Mapping.inspector.pickToSave')}</p>}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setJsonOpen(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.inspector.editJson')}</Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!edited} onClick={() => { setPendingKind(null); clearRow(row.h3Id) }}><Undo2 className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.inspector.resetRow')}</Button>
      </div>
      <p className="text-muted-foreground">{t('h3Mapping.appliesToNext')}</p>

      <JsonDialog open={jsonOpen} onOpenChange={setJsonOpen} row={row} onApply={commit} />
    </div>
  )
}

function JsonDialog({ open, onOpenChange, row, onApply }: { open: boolean; onOpenChange: (open: boolean) => void; row: ObjectRow; onApply: (row: ObjectRow) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  // The parent opens the dialog by setting `open`, which never calls onOpenChange: load the row's JSON whenever it opens.
  useEffect(() => {
    if (!open) return
    setText(JSON.stringify(row, null, 2))
    setError(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{t('h3Mapping.jsonTitle', { id: row.h3Id, name: row.h3Name })}</DialogTitle></DialogHeader>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="h-96 font-mono text-xs" />
        {error && <p className="text-xs text-destructive">{t('h3Mapping.jsonInvalid', { error })}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('shared.cancel')}</Button>
          <Button
            onClick={() => {
              const result = parseRowJson(text, row.h3Id)
              if ('error' in result) { setError(result.error); return }
              onApply(result.row)
              onOpenChange(false)
            }}
          >
            {t('h3Mapping.jsonApply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
