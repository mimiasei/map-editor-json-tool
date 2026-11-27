// The weighted list of a random mix (MixEntry in h3-object-mapping-schema.ts): each entry names where its OE objects come from (one object, every
// object whose sid starts with a prefix, or a tree of a biome) and how often it is picked. Shared by the mix rows and the sprite rules.

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X } from '@/components/ui/icons'
import EntityCombobox from '@/components/common/EntityCombobox'
import type { MixEntry } from '@/lib/h3-import/h3-object-mapping-schema'

type PoolKind = 'sids' | 'prefix' | 'trees'

/** The tree biomes a mix can draw from, each named by one of its tree sids (the table's own way of naming a biome). */
export const TREE_BIOME_CHOICES: { sid: string; label: string }[] = [
  { sid: 'pinetree_1', label: 'Grass' },
  { sid: 'tree_dirt_1', label: 'Dirt' },
  { sid: 'tree_dead_1', label: 'Deathland' },
  { sid: 'pinetree_snow_1', label: 'Snow' },
  { sid: 'tree_lava_1', label: 'Lava' },
]

function kindOf(entry: MixEntry): PoolKind {
  if (entry.trees !== undefined) return 'trees'
  if (entry.prefix !== undefined) return 'prefix'
  return 'sids'
}

function withKind(entry: MixEntry, kind: PoolKind): MixEntry {
  if (kind === kindOf(entry)) return entry
  if (kind === 'trees') return { trees: TREE_BIOME_CHOICES[1].sid, weight: entry.weight }
  if (kind === 'prefix') return { prefix: '', weight: entry.weight }
  return { sids: [], weight: entry.weight }
}

export default function MixEditor({ entries, onChange }: { entries: MixEntry[]; onChange: (entries: MixEntry[]) => void }) {
  const { t } = useTranslation()
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  const update = (index: number, next: MixEntry) => onChange(entries.map((entry, i) => (i === index ? next : entry)))

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => {
        const kind = kindOf(entry)
        return (
          <div key={index} className="space-y-1.5 rounded-md border border-border p-2">
            <div className="flex items-center gap-1.5">
              <Select value={kind} onValueChange={(v) => update(index, withKind(entry, v as PoolKind))}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sids">{t('h3Mapping.mix.poolObjects')}</SelectItem>
                  <SelectItem value="prefix">{t('h3Mapping.mix.poolPrefix')}</SelectItem>
                  <SelectItem value="trees">{t('h3Mapping.mix.poolTrees')}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                step={1}
                value={entry.weight}
                onChange={(e) => update(index, { ...entry, weight: Math.max(0, Number(e.target.value) || 0) })}
                className="h-7 w-16 text-xs"
                title={t('h3Mapping.mix.weight')}
              />
              <span className="w-10 text-muted-foreground">{total > 0 ? `${Math.round((entry.weight / total) * 100)}%` : '0%'}</span>
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => onChange(entries.filter((_, i) => i !== index))} title={t('h3Mapping.mix.removeEntry')} disabled={entries.length <= 1}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {kind === 'sids' && ((entry.sids?.length ?? 0) <= 1 ? (
              <EntityCombobox
                value={entry.sids?.[0] ?? ''}
                category="mapObject"
                placeholder={t('h3Mapping.inspector.pickObject')}
                onChange={(sid) => update(index, { ...entry, sids: sid.trim() ? [sid.trim()] : [] })}
              />
            ) : (
              <Input
                defaultValue={(entry.sids ?? []).join(', ')}
                className="h-7 font-mono text-xs"
                onBlur={(e) => update(index, { ...entry, sids: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                title={t('h3Mapping.mix.sidList')}
              />
            ))}
            {kind === 'prefix' && (
              <Input value={entry.prefix ?? ''} onChange={(e) => update(index, { ...entry, prefix: e.target.value })} placeholder="palms_" className="h-7 font-mono text-xs" title={t('h3Mapping.mix.prefixHint')} />
            )}
            {kind === 'trees' && (
              <Select value={entry.trees} onValueChange={(v) => update(index, { ...entry, trees: v })}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TREE_BIOME_CHOICES.map((choice) => <SelectItem key={choice.sid} value={choice.sid}>{choice.label}</SelectItem>)}
                  {!TREE_BIOME_CHOICES.some((choice) => choice.sid === entry.trees) && <SelectItem value={entry.trees as string}>{entry.trees}</SelectItem>}
                </SelectContent>
              </Select>
            )}
          </div>
        )
      })}
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onChange([...entries, { sids: [], weight: 1 }])}>{t('h3Mapping.mix.addEntry')}</Button>
      <p className="text-muted-foreground">{t('h3Mapping.mix.hint')}</p>
    </div>
  )
}
