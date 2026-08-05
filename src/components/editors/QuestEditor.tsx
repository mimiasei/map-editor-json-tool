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

// The official guide documents a closed set of `sharing` values with real behavioral
// differences: Clone/Shared/Ai/All apply per-scope, and Side0-Side7 pin the quest to one
// specific player index. Kept as a dropdown-with-custom-fallback (same pattern as
// InterruptionEditor's type field) so existing free-text values still display correctly.
const SHARING_OPTIONS: { value: string; hint: string }[] = [
  { value: 'Clone', hint: 'Cloned for every human player' },
  { value: 'Shared', hint: 'One shared quest for all human players' },
  { value: 'Ai', hint: 'Works for the first AI player in turn after the human player' },
  { value: 'All', hint: 'Shared for all players' },
]
const SHARING_SIDE_OPTIONS = Array.from({ length: 8 }, (_, i) => `Side${i}`)
const KNOWN_SHARING_VALUES = [...SHARING_OPTIONS.map((o) => o.value), ...SHARING_SIDE_OPTIONS]

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
        <Label>Description (localization key)</Label>
        <Input
          value={quest.desc ?? ''}
          onChange={(e) => update({ desc: e.target.value || undefined })}
          placeholder="e.g. my_quest_description"
        />
        <p className="text-xs text-muted-foreground">
          Additional narrative/gameplay text shown in the quest log, separate from the name.
        </p>
      </div>

      <div className="space-y-1">
        <Label>Sharing</Label>
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
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SHARING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.value} — {o.hint}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Specific player index</SelectLabel>
                    {SHARING_SIDE_OPTIONS.map((v, i) => (
                      <SelectItem key={v} value={v}>
                        {v} — Only Player {i + 1}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectItem value="__custom__">Custom…</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {isCustom && (
                <Input
                  value={quest.sharing ?? ''}
                  onChange={(e) => update({ sharing: e.target.value || undefined })}
                  placeholder="Custom sharing value"
                  className="flex-1"
                />
              )}
            </div>
          )
        })()}
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

      <div className="space-y-1">
        <Label>Subquest Groups</Label>
        <p className="text-xs text-muted-foreground">
          Gate a subquest (or another group) on several subquests finishing together, via
          NextAfterGroup / NextQuestAfterGroup / NextSubGroupAfterGroup.
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
