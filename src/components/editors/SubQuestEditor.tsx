import { useScenarioStore } from '@/store/useScenarioStore'
import type { SubQuest } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  questIndex: number
  subQuestIndex: number
  subQuest: SubQuest
}

export default function SubQuestEditor({ questIndex, subQuestIndex, subQuest }: Props) {
  const { updateSubQuest } = useScenarioStore()

  if (!subQuest) return null

  const update = (patch: Partial<SubQuest>) =>
    updateSubQuest(questIndex, subQuestIndex, patch)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        SubQuest
      </h2>

      <div className="space-y-1">
        <Label>SID</Label>
        <Input
          value={subQuest.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder="e.g. 1"
        />
        <p className="text-xs text-muted-foreground">
          Referenced by SubQuestActivate / SubQuestDeactivate actions.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Name (localization key)</Label>
        <Input
          value={subQuest.name ?? ''}
          onChange={(e) => update({ name: e.target.value || undefined })}
          placeholder="e.g. my_quest_sub_1"
        />
      </div>

      <div className="space-y-1">
        <Label>Developer comment</Label>
        <Input
          value={subQuest.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value || undefined })}
          placeholder="Optional note (not used by game engine)"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="sq-active"
          checked={subQuest.activeOnStart}
          onCheckedChange={(v) => update({ activeOnStart: !!v })}
        />
        <Label htmlFor="sq-active">Active on start</Label>
      </div>
    </div>
  )
}
