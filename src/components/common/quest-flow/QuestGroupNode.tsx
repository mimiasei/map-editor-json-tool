import { type NodeProps, type Node } from '@xyflow/react'
import type { GroupNodeData } from '@/lib/quest-flow'

export type GroupFlowNode = Node<GroupNodeData, 'questGroup'>

export function QuestGroupNode({ data }: NodeProps<GroupFlowNode>) {
  return (
    <div
      className="h-full w-full rounded-lg border-2"
      style={{ borderColor: data.color, backgroundColor: `${data.color}0d` /* ~5% opacity */ }}
    >
      <span
        className="absolute top-2 left-3 text-[10px] font-semibold font-mono tracking-wide"
        style={{ color: data.color }}
      >
        {data.questSid}
      </span>
    </div>
  )
}
