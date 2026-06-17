import { useScenarioStore } from '@/store/useScenarioStore'
import type { Quest } from '@/types/scenario'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  index: number
  quest: Quest
}

export default function QuestEditor({ index, quest }: Props) {
  const { updateQuest } = useScenarioStore()

  if (!quest) return null

  const update = (patch: Partial<Quest>) => updateQuest(index, patch)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Quest
      </h2>

      <div className="space-y-1">
        <Label>SID</Label>
        <Input
          value={quest.sid}
          onChange={(e) => update({ sid: e.target.value })}
          placeholder="e.g. main_quest_line"
        />
      </div>

      <div className="space-y-1">
        <Label>Name (localization key)</Label>
        <Input
          value={quest.name ?? ''}
          onChange={(e) => update({ name: e.target.value || undefined })}
          placeholder="e.g. my_quest_name"
        />
        <p className="text-xs text-muted-foreground">Shown in the in-game quest log.</p>
      </div>

      <div className="space-y-1">
        <Label>Sharing</Label>
        <Input
          value={quest.sharing ?? ''}
          onChange={(e) => update({ sharing: e.target.value || undefined })}
          placeholder="e.g. Clone"
        />
      </div>

      <div className="space-y-1">
        <Label>Developer comment</Label>
        <Input
          value={quest.comment ?? ''}
          onChange={(e) => update({ comment: e.target.value || undefined })}
          placeholder="Optional note (not used by game engine)"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="quest-active"
            checked={quest.activeOnStart}
            onCheckedChange={(v) => update({ activeOnStart: !!v })}
          />
          <Label htmlFor="quest-active">Active on start</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quest-main"
            checked={quest.main ?? false}
            onCheckedChange={(v) => update({ main: !!v || undefined })}
          />
          <Label htmlFor="quest-main">Main quest (visible as primary objective)</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="quest-hidden"
            checked={quest.hidden ?? false}
            onCheckedChange={(v) => update({ hidden: !!v || undefined })}
          />
          <Label htmlFor="quest-hidden">Hidden from quest log</Label>
        </div>
      </div>
    </div>
  )
}
