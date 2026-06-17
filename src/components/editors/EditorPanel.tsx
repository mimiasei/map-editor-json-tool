import { useScenarioStore } from '@/store/useScenarioStore'
import CounterEditor from './CounterEditor'
import InterruptionEditor from './InterruptionEditor'
import QuestEditor from './QuestEditor'
import SubQuestEditor from './SubQuestEditor'
import TriggerEditor from './TriggerEditor'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function EditorPanel() {
  const { selectedType, selectedPath, scenario } = useScenarioStore()

  if (!selectedType) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground p-6 text-center">
        Select an item from the sidebar to edit it.
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4">
        {selectedType === 'counter' && (
          <CounterEditor index={selectedPath[0]} counter={scenario.counters[selectedPath[0]]} />
        )}
        {selectedType === 'interruption' && (
          <InterruptionEditor
            index={selectedPath[0]}
            interruption={scenario.interruptions[selectedPath[0]]}
          />
        )}
        {selectedType === 'quest' && (
          <QuestEditor index={selectedPath[0]} quest={scenario.quests[selectedPath[0]]} />
        )}
        {selectedType === 'subquest' && (
          <SubQuestEditor
            questIndex={selectedPath[0]}
            subQuestIndex={selectedPath[1]}
            subQuest={scenario.quests[selectedPath[0]]?.subQuests[selectedPath[1]]}
          />
        )}
        {selectedType === 'trigger' && (
          <TriggerEditor
            questIndex={selectedPath[0]}
            subQuestIndex={selectedPath[1]}
            triggerIndex={selectedPath[2]}
            trigger={
              scenario.quests[selectedPath[0]]?.subQuests[selectedPath[1]]?.triggers[
                selectedPath[2]
              ]
            }
          />
        )}
      </div>
    </ScrollArea>
  )
}
