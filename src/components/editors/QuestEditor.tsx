import { useScenarioStore } from '@/store/useScenarioStore'
import type { Quest, SubQuestGroup } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import SubQuestGroupList from './SubQuestGroupList'
import { useTranslation } from 'react-i18next'

// The official guide documents a closed set of `sharing` values with real behavioral
// differences: Clone/Shared/Ai/All apply per-scope, and Side0-Side7 pin the quest to one
// specific player index. Kept as a dropdown-with-custom-fallback (same pattern as
// InterruptionEditor's type field) so existing free-text values still display correctly.
// Hints live in en.json under editors.questEditor.sharingHints.<value>.
const SHARING_OPTIONS = ['Clone', 'Shared', 'Ai', 'All'] as const
const SHARING_SIDE_OPTIONS = Array.from({ length: 8 }, (_, i) => `Side${i}`)
const KNOWN_SHARING_VALUES = [...SHARING_OPTIONS, ...SHARING_SIDE_OPTIONS]

interface Props {
  index: number
  quest: Quest
}

export default function QuestEditor({ index, quest }: Props) {
  const { t } = useTranslation()
  const { updateQuest } = useScenarioStore()

  if (!quest) return null

  const update = (patch: Partial<Quest>) => updateQuest(index, patch)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        {t('dialogs.localizationDialog.quest')}
      </h2>

      <div className="space-y-1">
        <Label>{t('shared.sID')}</Label>
        <Input
          value={quest.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder={t('editors.questEditor.eGMainQuestLine')}
        />
      </div>

      <div className="space-y-1">
        <Label>{t('editors.questEditor.nameLocalizationKey')}</Label>
        <Input
          value={quest.name ?? ''}
          onChange={(e) => update({ name: e.target.value || undefined })}
          placeholder={t('editors.questEditor.eGMyQuestName')}
        />
        <p className="text-xs text-muted-foreground">{t('editors.questEditor.shownInTheInGame')}</p>
      </div>

      <div className="space-y-1">
        <Label>{t('editors.questEditor.descriptionLocalizationKey')}</Label>
        <Input
          value={quest.desc ?? ''}
          onChange={(e) => update({ desc: e.target.value || undefined })}
          placeholder={t('editors.questEditor.eGMyQuestDescription')}
        />
        <p className="text-xs text-muted-foreground">
          {t('editors.questEditor.additionalNarrativeGameplayTextShown')}
        </p>
      </div>

      <div className="space-y-1">
        <Label>{t('shared.sharing')}</Label>
        {(() => {
          const isCustom = !!quest.sharing && !KNOWN_SHARING_VALUES.includes(quest.sharing)
          return (
            <div className="flex gap-2">
              <Select
                value={isCustom ? '__custom__' : (quest.sharing ?? '')}
                onValueChange={(v) => {
                  if (v !== '__custom__') update({ sharing: v || undefined })
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={t('mapGrid.mapGridCellContent.notSet')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SHARING_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {t('editors.questEditor.sharingOption', { value: o, hint: t(`editors.questEditor.sharingHints.${o}`) })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>{t('editors.questEditor.specificPlayerIndex')}</SelectLabel>
                    {SHARING_SIDE_OPTIONS.map((v, i) => (
                      <SelectItem key={v} value={v}>
                        {t('editors.questEditor.sharingSide', { value: v, n: i + 1 })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectItem value="__custom__">{t('shared.custom')}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {isCustom && (
                <Input
                  value={quest.sharing ?? ''}
                  onChange={(e) => update({ sharing: e.target.value || undefined })}
                  placeholder={t('editors.questEditor.customSharingValue')}
                  className="flex-1"
                />
              )}
            </div>
          )
        })()}
      </div>

      <div className="space-y-1">
        <Label>{t('shared.developerComment')}</Label>
        <Input
          value={quest.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value || undefined })}
          placeholder={t('editors.questEditor.optionalNoteNotUsedBy')}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="quest-active"
            checked={quest.activeOnStart}
            onCheckedChange={(v) => update({ activeOnStart: !!v })}
          />
          <Label htmlFor="quest-active">{t('shared.activeOnStart')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quest-main"
            checked={quest.main ?? false}
            onCheckedChange={(v) => update({ main: !!v || undefined })}
          />
          <Label htmlFor="quest-main">{t('editors.questEditor.mainQuestVisibleAsPrimary')}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quest-hidden"
            checked={quest.hidden ?? false}
            onCheckedChange={(v) => update({ hidden: !!v || undefined })}
          />
          <Label htmlFor="quest-hidden">{t('editors.questEditor.hiddenFromQuestLog')}</Label>
        </div>
      </div>

      <div className="space-y-1">
        <Label>{t('editors.questEditor.subquestGroups')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('editors.questEditor.gateASubquestOrAnother')}
        </p>
        <SubQuestGroupList
          subQuests={quest.subQuests}
          groups={quest.subQuestGroups ?? []}
          onChange={(groups: SubQuestGroup[]) =>
            update({ subQuestGroups: groups.length ? groups : undefined })
          }
        />
      </div>
    </div>
  )
}
