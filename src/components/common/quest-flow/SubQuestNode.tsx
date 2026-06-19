import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Zap } from 'lucide-react'
import type { SubQuestNodeData } from '@/lib/quest-flow'

export type SubQuestFlowNode = Node<SubQuestNodeData, 'subquest'>

export function SubQuestNode({ data, selected }: NodeProps<SubQuestFlowNode>) {
  return (
    <div
      className="rounded-md border border-border bg-card text-card-foreground shadow-sm transition-shadow"
      style={{
        width: 210,
        borderLeftColor: data.color,
        borderLeftWidth: 3,
        boxShadow: selected ? `0 0 0 2px ${data.color}` : undefined,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-muted-foreground !border-none"
      />

      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 min-w-0">
            {data.isEntry && (
              <Zap
                className="h-3 w-3 shrink-0"
                style={{ color: data.color }}
                aria-label="entry point"
              />
            )}
            <span className="font-mono text-xs font-semibold truncate">{data.sid}</span>
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0 bg-muted rounded px-1 tabular-nums">
            {data.triggerCount}▸
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-0.5">
          {data.questSid}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-muted-foreground !border-none"
      />
    </div>
  )
}
