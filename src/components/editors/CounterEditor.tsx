import { useScenarioStore } from '@/store/useScenarioStore'
import type { Counter } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslation } from 'react-i18next'

interface Props {
  index: number
  counter: Counter
}

export default function CounterEditor({ index, counter }: Props) {
  const { t } = useTranslation()
  const { updateCounter } = useScenarioStore()

  if (!counter) return null

  const update = (patch: Partial<Counter>) =>
    updateCounter(index, { ...counter, ...patch })

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {t('editors.counterEditor.counter')}
      </h2>

      <div className="space-y-1">
        <Label htmlFor="counter-sid">{t('shared.sID')}</Label>
        <Input
          id="counter-sid"
          value={counter.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder={t('editors.counterEditor.eGMainQuestStage')}
        />
        <p className="text-xs text-muted-foreground">
          {t('editors.counterEditor.uniqueIdentifierReferencedByCounter')}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="counter-value">{t('editors.counterEditor.initialValue')}</Label>
        <Input
          id="counter-value"
          type="number"
          value={counter.value}
          onChange={(e) => update({ value: Number(e.target.value) })}
          className="w-32"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="counter-min">{t('editors.counterEditor.minValue')}</Label>
          <Input
            id="counter-min"
            type="number"
            value={counter.minValue ?? ''}
            onChange={(e) =>
              update({ minValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder={t('editors.counterEditor.noLowerBound')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="counter-max">{t('editors.counterEditor.maxValue')}</Label>
          <Input
            id="counter-max"
            type="number"
            value={counter.maxValue ?? ''}
            onChange={(e) =>
              update({ maxValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
            placeholder={t('editors.counterEditor.noUpperBound')}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        {t('editors.counterEditor.assigningAValueOutsideThis')}
      </p>

      <div className="space-y-1">
        <Label htmlFor="counter-sharing">{t('shared.sharing')}</Label>
        <Input
          id="counter-sharing"
          value={counter.sharing ?? ''}
          onChange={(e) => update({ sharing: e.target.value || undefined })}
          placeholder={t('editors.counterEditor.eGClone')}
        />
        <p className="text-xs text-muted-foreground">
          {t('editors.counterEditor.visibilityScopeMakesTheCounter')}
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="counter-comment">{t('shared.developerComment')}</Label>
        <Input
          id="counter-comment"
          value={counter.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value || undefined })}
          placeholder={t('editors.counterEditor.optionalNoteNotUsedBy')}
        />
      </div>
    </div>
  )
}
