import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { EndNodeData } from '@/lib/quest-flow'

export type EndFlowNode = Node<EndNodeData, 'endNode'>

export function EndNode({ data }: NodeProps<EndFlowNode>) {
  return (
    <div
      className="flex items-center justify-center rounded-full border-2 border-dashed px-4 text-[10px] font-semibold font-mono text-muted-foreground bg-card"
      style={{
        width: 140,
        height: 36,
        borderColor: data.color,
        color: data.color,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-muted-foreground !border-none"
      />
      END · {data.questSid}
    </div>
  )
}
