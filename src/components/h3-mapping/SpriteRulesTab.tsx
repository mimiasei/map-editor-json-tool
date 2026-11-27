// The sprite rules (SpriteRule in h3-object-mapping-schema.ts): an ordered list of patterns on the sprite's file name, checked before the object rows.
// The first rule that matches turns the object into a random mix of OE objects (cacti, palms, jungle clusters, dunes). Edits are the whole list.

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ArrowDown, ArrowUp, Undo2, X } from '@/components/ui/icons'
import MixEditor from './MixEditor'
import { useH3MappingStore } from '@/store/useH3MappingStore'
import { DEFAULT_SPRITE_RULES } from '@/lib/h3-import/h3-object-mapping'
import { mixEntryLabel } from '@/lib/h3-import/mapping-edit'
import type { SpriteRule } from '@/lib/h3-import/h3-object-mapping-schema'
import { cn } from '@/lib/utils'

function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern, 'i')
    return null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

export default function SpriteRulesTab({ query }: { query: string }) {
  const { t } = useTranslation()
  const custom = useH3MappingStore((s) => s.edits.spriteRules)
  const setSpriteRules = useH3MappingStore((s) => s.setSpriteRules)
  const rules: readonly SpriteRule[] = custom ?? DEFAULT_SPRITE_RULES
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sample, setSample] = useState('')

  const save = (next: SpriteRule[]) => setSpriteRules(JSON.stringify(next) === JSON.stringify(DEFAULT_SPRITE_RULES) ? null : next)
  const selectedIndex = rules.findIndex((rule) => rule.id === selectedId)
  const selected = selectedIndex >= 0 ? rules[selectedIndex] : null
  const q = query.trim().toLowerCase()
  const visible = useMemo(() => rules.filter((rule) => !q || `${rule.name} ${rule.pattern} ${rule.id}`.toLowerCase().includes(q)), [rules, q])
  // The first rule that matches the sample sprite name: what the importer would use.
  const matching = useMemo(() => {
    if (!sample.trim()) return null
    return rules.find((rule) => {
      try { return new RegExp(rule.pattern, 'i').test(sample.trim()) } catch { return false }
    }) ?? null
  }, [rules, sample])

  const update = (index: number, next: SpriteRule) => save(rules.map((rule, i) => (i === index ? next : rule)))
  const move = (index: number, by: number) => {
    const next = [...rules]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    save(next)
  }
  const addRule = () => {
    let n = rules.length + 1
    while (rules.some((rule) => rule.id === `rule${n}`)) n += 1
    const rule: SpriteRule = { id: `rule${n}`, name: t('h3Mapping.rules.newName'), pattern: '^avl', entries: [{ sids: [], weight: 1 }] }
    save([...rules, rule])
    setSelectedId(rule.id)
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs">
          <p className="min-w-0 flex-1 text-muted-foreground">{t('h3Mapping.rules.intro')}</p>
          <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder={t('h3Mapping.rules.trySprite')} className="h-8 w-52 font-mono text-xs" />
          {sample.trim() && <span className="text-muted-foreground">{matching ? t('h3Mapping.rules.matches', { name: matching.name }) : t('h3Mapping.rules.noMatch')}</span>}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addRule}>{t('h3Mapping.rules.add')}</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" disabled={custom === null} onClick={() => setSpriteRules(null)}><Undo2 className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.rules.reset')}</Button>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted text-left text-muted-foreground">
            <tr>
              <th className="w-10 px-2 py-1.5 font-medium">#</th>
              <th className="w-72 px-2 py-1.5 font-medium">{t('h3Mapping.rules.name')}</th>
              <th className="w-72 px-2 py-1.5 font-medium">{t('h3Mapping.rules.pattern')}</th>
              <th className="px-2 py-1.5 font-medium">{t('h3Mapping.rules.mix')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((rule) => (
              <tr
                key={rule.id}
                onClick={() => setSelectedId(rule.id)}
                className={cn('cursor-pointer border-t border-border/60 hover:bg-accent/50', selectedId === rule.id && 'bg-accent', matching?.id === rule.id && 'ring-1 ring-inset ring-primary')}
              >
                <td className="px-2 py-1 tabular-nums text-muted-foreground">{rules.indexOf(rule) + 1}</td>
                <td className="truncate px-2 py-1">
                  {rule.name}
                  {regexError(rule.pattern) && <Badge variant="destructive" className="ml-2 h-4 px-1.5 text-[10px]">{t('h3Mapping.rules.invalid')}</Badge>}
                </td>
                <td className="truncate px-2 py-1 font-mono">{rule.pattern}</td>
                <td className="truncate px-2 py-1 font-mono text-muted-foreground">
                  {rule.entries.map((entry) => `${mixEntryLabel(entry)} ×${entry.weight}`).join(', ')}
                  {rule.accent ? ` + ${rule.accent.map((entry) => mixEntryLabel(entry)).join(', ')}` : ''}
                </td>
              </tr>
            ))}
            {visible.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">{t('h3Mapping.noMatches')}</td></tr>}
          </tbody>
        </table>
      </div>
      <aside className="w-96 shrink-0 overflow-y-auto border-l border-border p-3 text-xs">
        {selected ? (
          <div className="space-y-3" key={selected.id}>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">{selected.name}</span>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={selectedIndex === 0} onClick={() => move(selectedIndex, -1)} title={t('h3Mapping.rules.moveUp')}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" disabled={selectedIndex === rules.length - 1} onClick={() => move(selectedIndex, 1)} title={t('h3Mapping.rules.moveDown')}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { save(rules.filter((_, i) => i !== selectedIndex)); setSelectedId(null) }} title={t('h3Mapping.rules.delete')}><X className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('h3Mapping.rules.name')}</Label>
              <Input value={selected.name} onChange={(e) => update(selectedIndex, { ...selected, name: e.target.value })} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('h3Mapping.rules.pattern')}</Label>
              <Input value={selected.pattern} onChange={(e) => update(selectedIndex, { ...selected, pattern: e.target.value })} className="h-8 font-mono text-xs" />
              {regexError(selected.pattern) ? <p className="text-destructive">{regexError(selected.pattern)}</p> : <p className="text-muted-foreground">{t('h3Mapping.rules.patternHint')}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('h3Mapping.rules.mix')}</Label>
              <MixEditor entries={selected.entries} onChange={(entries) => update(selectedIndex, { ...selected, entries })} />
            </div>
            <div className="space-y-1.5 rounded-md border border-border p-2">
              <div className="flex items-center gap-2">
                <Switch id="h3-rule-accent" checked={!!selected.accent} onCheckedChange={(on) => update(selectedIndex, { ...selected, accent: on ? [{ sids: [], weight: 1 }] : undefined })} />
                <Label htmlFor="h3-rule-accent" className="cursor-pointer text-xs">{t('h3Mapping.rules.accent')}</Label>
              </div>
              <p className="text-muted-foreground">{t('h3Mapping.rules.accentHint')}</p>
              {selected.accent && <MixEditor entries={selected.accent} onChange={(accent) => update(selectedIndex, { ...selected, accent })} />}
            </div>
            <p className="text-muted-foreground">{t('h3Mapping.appliesToNext')}</p>
          </div>
        ) : (
          <p className="text-muted-foreground">{t('h3Mapping.rules.select')}</p>
        )}
      </aside>
    </div>
  )
}
