import { useScenarioStore } from '@/store/useScenarioStore'
import type { SubQuest } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useTranslation } from 'react-i18next'

interface Props {
  questIndex: number
  subQuestIndex: number
  subQuest: SubQuest
}

export default function SubQuestEditor({ questIndex, subQuestIndex, subQuest }: Props) {
  const { t } = useTranslation()
  const { updateSubQuest } = useScenarioStore()

  if (!subQuest) return null

  const update = (patch: Partial<SubQuest>) =>
    updateSubQuest(questIndex, subQuestIndex, patch)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {t('editors.subQuestEditor.subQuest')}
      </h2>

      <div className="space-y-1">
        <Label>{t('shared.sID')}</Label>
        <Input
          value={subQuest.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder={t('editors.subQuestEditor.eG1')}
        />
        <p className="text-xs text-muted-foreground">
          {t('editors.subQuestEditor.referencedBySubQuestActivateSubQuestDeactivateActions')}
        </p>
      </div>

      <div className="space-y-1">
        <Label>{t('editors.subQuestEditor.nameLocalizationKey')}</Label>
        <Input
          value={subQuest.name ?? ''}
          onChange={(e) => update({ name: e.target.value || undefined })}
          placeholder={t('editors.subQuestEditor.eGMyQuestSub')}
        />
      </div>

      <div className="space-y-1">
        <Label>{t('shared.developerComment')}</Label>
        <Input
          value={subQuest.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value || undefined })}
          placeholder={t('editors.subQuestEditor.optionalNoteNotUsedBy')}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="sq-active"
          checked={subQuest.activeOnStart}
          onCheckedChange={(v) => update({ activeOnStart: !!v })}
        />
        <Label htmlFor="sq-active">{t('shared.activeOnStart')}</Label>
      </div>
    </div>
  )
}
