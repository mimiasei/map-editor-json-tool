// The biome borrowing rules (`decorationRules` in h3-object-mapping.json): which biome may use the trees or mountains of which other biome, and how big
// a share of its picks they make. They widen the single sid of the role table to a varied forest or range. Edits are the whole list.

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Undo2, X } from '@/components/ui/icons'
import { useH3MappingStore } from '@/store/useH3MappingStore'
import { DEFAULT_DECORATION_RULES } from '@/lib/h3-import/h3-object-mapping'
import { BIOME_NAMES, type DecorationRuleData } from '@/lib/h3-import/h3-object-mapping-schema'

const ANY_TYPE = '*'
const TYPES = ['tree', 'mountain']

export default function MixingTab() {
  const { t } = useTranslation()
  const custom = useH3MappingStore((s) => s.edits.decorationRules)
  const setRules = useH3MappingStore((s) => s.setDecorationRules)
  const rules: readonly DecorationRuleData[] = custom ?? DEFAULT_DECORATION_RULES
  const save = (next: DecorationRuleData[]) => setRules(JSON.stringify(next) === JSON.stringify(DEFAULT_DECORATION_RULES) ? null : next)
  const update = (index: number, rule: DecorationRuleData) => save(rules.map((r, i) => (i === index ? rule : r)))
  const biomeSelect = (value: string, onChange: (v: DecorationRuleData['into']) => void) => (
    <Select value={value} onValueChange={(v) => onChange(v as DecorationRuleData['into'])}>
      <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{BIOME_NAMES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
    </Select>
  )
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
      <div className="mb-3 flex max-w-3xl items-start gap-3">
        <p className="flex-1 text-muted-foreground">{t('h3Mapping.mixing.intro')}</p>
        <Button variant="outline" size="sm" className="h-8 text-xs" disabled={custom === null} onClick={() => setRules(null)}><Undo2 className="mr-1.5 h-3.5 w-3.5" />{t('h3Mapping.mixing.reset')}</Button>
      </div>
      <div className="space-y-1.5">
        {rules.map((rule, index) => (
          <div key={index} className="flex max-w-3xl items-center gap-2 rounded-md border border-border p-2">
            {biomeSelect(rule.into, (into) => update(index, { ...rule, into }))}
            <span className="text-muted-foreground">{t('h3Mapping.mixing.uses')}</span>
            <Select value={rule.type ?? ANY_TYPE} onValueChange={(v) => update(index, { ...rule, type: v === ANY_TYPE ? undefined : v })}>
              <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_TYPE}>{t('h3Mapping.mixing.anyType')}</SelectItem>
                {TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">{t('h3Mapping.mixing.of')}</span>
            {biomeSelect(rule.from, (from) => update(index, { ...rule, from }))}
            <Input
              type="number" min={0} max={100} step={1}
              value={Math.round(rule.chance * 100)}
              onChange={(e) => update(index, { ...rule, chance: Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)) })}
              className="ml-auto h-7 w-16 text-xs"
            />
            <span className="text-muted-foreground">%</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => save(rules.filter((_, i) => i !== index))} title={t('h3Mapping.mixing.delete')}><X className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="mt-3 h-8 text-xs" onClick={() => save([...rules, { into: 'Grass', from: 'Dirt', chance: 0.1 }])}>{t('h3Mapping.mixing.add')}</Button>
      <p className="mt-3 text-muted-foreground">{t('h3Mapping.appliesToNext')}</p>
    </div>
  )
}
