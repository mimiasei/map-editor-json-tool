// The converter's tuning numbers (H3Settings in h3-object-mapping-schema.ts), each with its shipped value and a reset.

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Undo2 } from '@/components/ui/icons'
import { useH3MappingStore } from '@/store/useH3MappingStore'
import { DEFAULT_SETTINGS } from '@/lib/h3-import/h3-object-mapping'
import type { H3Settings } from '@/lib/h3-import/h3-object-mapping-schema'

const SETTING_KEYS: (keyof H3Settings)[] = ['mountainFrontChance', 'walkableFillChance', 'lavaTreeChance', 'pocketMaxTiles']
const LIMITS: Record<keyof H3Settings, { min: number; max: number; step: number }> = {
  mountainFrontChance: { min: 0, max: 1, step: 0.01 },
  walkableFillChance: { min: 0, max: 1, step: 0.01 },
  lavaTreeChance: { min: 0, max: 1, step: 0.01 },
  pocketMaxTiles: { min: 1, max: 500, step: 1 },
}

export default function SettingsTab() {
  const { t } = useTranslation()
  const settings = useH3MappingStore((s) => s.edits.settings)
  const setSetting = useH3MappingStore((s) => s.setSetting)
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
      <p className="mb-4 max-w-2xl text-muted-foreground">{t('h3Mapping.settings.intro')}</p>
      <div className="max-w-2xl space-y-4">
        {SETTING_KEYS.map((key) => {
          const value = settings[key] ?? DEFAULT_SETTINGS[key]
          const limits = LIMITS[key]
          const edited = settings[key] !== undefined
          return (
            <div key={key} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2">
                <Label htmlFor={`h3-setting-${key}`} className="text-xs font-semibold">{t(`h3Mapping.settings.${key}.label`)}</Label>
                {edited && <span className="inline-block h-2 w-2 rounded-full bg-primary" title={t('h3Mapping.edited')} />}
                <Input
                  id={`h3-setting-${key}`}
                  type="number"
                  min={limits.min}
                  max={limits.max}
                  step={limits.step}
                  value={value}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n)) setSetting(key, Math.min(limits.max, Math.max(limits.min, n)))
                  }}
                  className="ml-auto h-7 w-24 text-xs"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!edited} onClick={() => setSetting(key, null)} title={t('h3Mapping.settings.reset')}><Undo2 className="h-3.5 w-3.5" /></Button>
              </div>
              <p className="mt-1 text-muted-foreground">{t(`h3Mapping.settings.${key}.help`)} <span className="whitespace-nowrap">({t('h3Mapping.default')}: {DEFAULT_SETTINGS[key]})</span></p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
