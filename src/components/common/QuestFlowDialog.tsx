import '@xyflow/react/dist/style.css'

import { useMemo, useState, useCallback, type ComponentType } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  type NodeTypes,
  type ReactFlowInstance,
  type NodeMouseHandler,
} from '@xyflow/react'
import { useScenarioStore } from '@/store/useScenarioStore'
import {
  buildQuestFlow,
  type SubQuestNodeData,
  type FlowNode,
} from '@/lib/quest-flow'
import { SubQuestNode } from './quest-flow/SubQuestNode'
import { QuestGroupNode } from './quest-flow/QuestGroupNode'
import { EndNode } from './quest-flow/EndNode'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Maximize2, X, Zap } from 'lucide-react'

// ─── nodeTypes must be defined outside the component (React Flow requirement) ─

const NODE_TYPES: NodeTypes = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subquest:   SubQuestNode   as ComponentType<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  questGroup: QuestGroupNode as ComponentType<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endNode:    EndNode        as ComponentType<any>,
}

// ─── Info panel shown when a subquest node is selected ────────────────────────

interface InfoPanelProps {
  data: SubQuestNodeData
  onNavigate: (qi: number, sqi: number) => void
  onClose: () => void
}

function InfoPanel({ data, onNavigate, onClose }: InfoPanelProps) {
  return (
    <div className="rounded-lg border border-border bg-card text-card-foreground shadow-lg p-3 w-56 text-xs">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            {data.isEntry && <Zap className="h-3 w-3 shrink-0" style={{ color: data.color }} />}
            <span className="font-mono font-semibold truncate">{data.sid}</span>
          </div>
          <p className="text-muted-foreground truncate mt-0.5">{data.questSid}</p>
        </div>
        <button
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {data.triggerCount} trigger{data.triggerCount !== 1 ? 's' : ''}
        </Badge>
        {data.isEntry && (
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]" style={{ borderColor: data.color, color: data.color }}>
            entry
          </Badge>
        )}
      </div>

      <Button
        size="sm"
        variant="default"
        className="w-full h-7 text-xs"
        onClick={() => onNavigate(data.questIdx, data.subQuestIdx)}
      >
        Open in editor
      </Button>
    </div>
  )
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface QuestFlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function QuestFlowDialog({ open, onOpenChange }: QuestFlowDialogProps) {
  const { scenario, setSelection } = useScenarioStore()
  const [showLabels, setShowLabels]     = useState(true)
  const [closeOnNav, setCloseOnNav]     = useState(true)
  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [rfInstance, setRfInstance]     = useState<ReactFlowInstance<FlowNode> | null>(null)

  const { nodes, edges } = useMemo(() => buildQuestFlow(scenario), [scenario])

  // Strip/restore edge labels based on toggle
  const displayEdges = useMemo(
    () => showLabels ? edges : edges.map((e) => ({ ...e, label: undefined })),
    [edges, showLabels],
  )

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId && n.type === 'subquest') ?? null,
    [nodes, selectedId],
  )

  const handleNodeClick: NodeMouseHandler<FlowNode> = useCallback((_, node) => {
    if (node.type === 'subquest') setSelectedId(node.id)
  }, [])

  const handlePaneClick = useCallback(() => setSelectedId(null), [])

  const handleNavigate = useCallback((qi: number, sqi: number) => {
    setSelection('subquest', [qi, sqi])
    setSelectedId(null)
    if (closeOnNav) onOpenChange(false)
  }, [setSelection, closeOnNav, onOpenChange])

  const handleFitView = useCallback(() => {
    rfInstance?.fitView({ padding: 0.1 })
  }, [rfInstance])

  const isEmpty = nodes.filter((n) => n.type === 'subquest').length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col max-w-[92vw] w-[92vw] max-h-[92vh] h-[92vh] p-0 overflow-hidden gap-0">
        <DialogTitle className="sr-only">Quest Flow Diagram</DialogTitle>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 px-5 py-3 border-b shrink-0">
          <p className="text-sm font-semibold leading-none">Quest Flow</p>

          <div className="flex items-center gap-1.5">
            <Switch
              id="show-labels"
              checked={showLabels}
              onCheckedChange={setShowLabels}
              className="scale-90"
            />
            <Label htmlFor="show-labels" className="text-xs text-muted-foreground cursor-pointer">
              Labels
            </Label>
          </div>

          <div className="flex items-center gap-1.5">
            <Switch
              id="qf-close-on-nav"
              checked={closeOnNav}
              onCheckedChange={setCloseOnNav}
              className="scale-90"
            />
            <Label htmlFor="qf-close-on-nav" className="text-xs text-muted-foreground cursor-pointer">
              Close on navigate
            </Label>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs ml-auto mr-7"
            onClick={handleFitView}
            disabled={isEmpty}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fit view
          </Button>
        </div>

        {/* ── Canvas ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0">
          {isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No subquests yet. Add quests with subquests to see the flow diagram.
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={displayEdges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.1 }}
              onInit={setRfInstance}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              deleteKeyCode={null}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />

              {/* Info panel — top-right of canvas */}
              {selectedNode && selectedNode.type === 'subquest' && (
                <Panel position="top-right">
                  <InfoPanel
                    data={selectedNode.data as SubQuestNodeData}
                    onNavigate={handleNavigate}
                    onClose={() => setSelectedId(null)}
                  />
                </Panel>
              )}
            </ReactFlow>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
