// ─── Quest Flow Diagram — graph derivation + dagre layout ───────────────────
// Derives React Flow nodes and edges from the scenario's quest/subquest/trigger
// structure by scanning quest-management actions. Group nodes are computed after
// dagre layout and used purely as visual background rectangles.

import { graphlib, layout as dagreLayout } from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { ScenarioFile, Action } from '@/types/scenario'

// ─── Constants ────────────────────────────────────────────────────────────────

export const NODE_W = 210
export const NODE_H = 62
export const END_W = 140
export const END_H = 36
export const GROUP_PAD = 40

export const QUEST_COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#f43f5e', // rose-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#d946ef', // fuchsia-500
]

// ─── Node data types ──────────────────────────────────────────────────────────

export type SubQuestNodeData = {
  label: string
  sid: string
  questSid: string
  questIdx: number
  subQuestIdx: number
  isEntry: boolean
  triggerCount: number
  color: string
}

export type GroupNodeData = {
  label: string
  questSid: string
  color: string
}

export type EndNodeData = {
  label: string
  questSid: string
  color: string
}

export type SubQuestFlowNode = Node<SubQuestNodeData, 'subquest'>
export type GroupFlowNode   = Node<GroupNodeData,    'questGroup'>
export type EndFlowNode     = Node<EndNodeData,      'endNode'>
export type FlowNode        = SubQuestFlowNode | GroupFlowNode | EndFlowNode
export type FlowEdge        = Edge

// ─── Internal edge spec ───────────────────────────────────────────────────────

interface EdgeSpec {
  source: string
  target: string
  label: string
  dash: string | undefined // strokeDasharray value, undefined = solid
}

// ─── Target resolution helpers ────────────────────────────────────────────────

function findSqId(scenario: ScenarioFile, questSid: string, subSid: string): string | null {
  const qi = scenario.quests.findIndex((q) => q.sid === questSid)
  if (qi === -1) return null
  const sqi = scenario.quests[qi].subQuests.findIndex((sq) => sq.sid === subSid)
  if (sqi === -1) return null
  return `sq-${qi}-${sqi}`
}

function findSqIdBySid(scenario: ScenarioFile, sid: string): string | null {
  for (let qi = 0; qi < scenario.quests.length; qi++) {
    const sqi = scenario.quests[qi].subQuests.findIndex((sq) => sq.sid === sid)
    if (sqi !== -1) return `sq-${qi}-${sqi}`
  }
  return null
}

// ─── Edge derivation ──────────────────────────────────────────────────────────

function deriveEdges(scenario: ScenarioFile): EdgeSpec[] {
  const specs: EdgeSpec[] = []
  const seen = new Set<string>()

  const add = (spec: EdgeSpec) => {
    if (!spec.source || !spec.target) return
    if (spec.source === spec.target) return
    const key = `${spec.source}→${spec.target}→${spec.label}`
    if (seen.has(key)) return
    seen.add(key)
    specs.push(spec)
  }

  scenario.quests.forEach((quest, qi) => {
    quest.subQuests.forEach((subQuest, sqi) => {
      const src = `sq-${qi}-${sqi}`

      subQuest.triggers.forEach((trigger) => {
        trigger.actions.forEach((action: Action) => {
          const p = action.p ?? []

          switch (action.a) {
            case 'NextSubQuest': {
              // p[0] = subquest SID or 0-based numeric index within the same quest
              const val = p[0] ?? ''
              const n = Number(val)
              let tgt: string | null = null
              if (val !== '' && !isNaN(n)) {
                if (n >= 0 && n < quest.subQuests.length) tgt = `sq-${qi}-${n}`
              } else {
                const local = quest.subQuests.findIndex((sq) => sq.sid === val)
                tgt = local !== -1 ? `sq-${qi}-${local}` : findSqIdBySid(scenario, val)
              }
              if (tgt) add({ source: src, target: tgt, label: 'Next', dash: undefined })
              break
            }
            case 'SubQuestActivate': {
              const tgt = findSqId(scenario, p[0] ?? '', p[1] ?? '')
              if (tgt) add({ source: src, target: tgt, label: 'Activate', dash: undefined })
              break
            }
            case 'NextQuest': {
              const tqi = scenario.quests.findIndex((q) => q.sid === (p[0] ?? ''))
              if (tqi !== -1) {
                const tsqi = scenario.quests[tqi].subQuests.findIndex((sq) => sq.activeOnStart)
                if (tsqi !== -1) add({ source: src, target: `sq-${tqi}-${tsqi}`, label: 'Next Quest', dash: undefined })
              }
              break
            }
            case 'EndQuest': {
              const tqi = scenario.quests.findIndex((q) => q.sid === (p[0] ?? ''))
              if (tqi !== -1) add({ source: src, target: `end-${tqi}`, label: 'End', dash: '6 3' })
              break
            }
            case 'SubQuestDone': {
              const tgt = findSqId(scenario, p[0] ?? '', p[1] ?? '')
              if (tgt) add({ source: src, target: tgt, label: 'Done', dash: '2 4' })
              break
            }
            case 'NextAfterGroup': {
              // p[1] = next subquest SID
              const tgt = findSqIdBySid(scenario, p[1] ?? '')
              if (tgt) add({ source: src, target: tgt, label: 'After Group', dash: undefined })
              break
            }
          }
        })
      })
    })
  })

  return specs
}

// ─── Build + layout ───────────────────────────────────────────────────────────

export function buildQuestFlow(scenario: ScenarioFile): {
  nodes: FlowNode[]
  edges: FlowEdge[]
} {
  if (scenario.quests.every((q) => q.subQuests.length === 0)) {
    return { nodes: [], edges: [] }
  }

  // ── Which quests need an End node ──────────────────────────────────────────
  const endNodeNeeded = new Set<number>()
  scenario.quests.forEach((quest) => {
    quest.subQuests.forEach((sq) => {
      sq.triggers.forEach((t) => {
        t.actions.forEach((a) => {
          if (a.a === 'EndQuest') {
            const tqi = scenario.quests.findIndex((q) => q.sid === (a.p?.[0] ?? ''))
            if (tqi !== -1) endNodeNeeded.add(tqi)
          }
        })
      })
    })
  })

  // ── Run dagre on content nodes (subquest + end nodes only) ─────────────────
  const g = new graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  scenario.quests.forEach((quest, qi) => {
    quest.subQuests.forEach((_, sqi) => {
      g.setNode(`sq-${qi}-${sqi}`, { width: NODE_W, height: NODE_H })
    })
  })

  endNodeNeeded.forEach((qi) => {
    g.setNode(`end-${qi}`, { width: END_W, height: END_H })
  })

  const edgeSpecs = deriveEdges(scenario)
  edgeSpecs.forEach(({ source, target }) => {
    if (g.hasNode(source) && g.hasNode(target)) g.setEdge(source, target)
  })

  dagreLayout(g)

  // ── Subquest nodes ─────────────────────────────────────────────────────────
  const contentNodes: FlowNode[] = []

  scenario.quests.forEach((quest, qi) => {
    const color = QUEST_COLORS[qi % QUEST_COLORS.length]
    quest.subQuests.forEach((sq, sqi) => {
      const pos = g.node(`sq-${qi}-${sqi}`)
      if (!pos) return
      contentNodes.push({
        id: `sq-${qi}-${sqi}`,
        type: 'subquest',
        position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
        data: {
          label: sq.sid,
          sid: sq.sid,
          questSid: quest.sid,
          questIdx: qi,
          subQuestIdx: sqi,
          isEntry: sq.activeOnStart,
          triggerCount: sq.triggers.length,
          color,
        },
      })
    })
  })

  // ── End nodes ──────────────────────────────────────────────────────────────
  endNodeNeeded.forEach((qi) => {
    const pos = g.node(`end-${qi}`)
    if (!pos) return
    const color = QUEST_COLORS[qi % QUEST_COLORS.length]
    contentNodes.push({
      id: `end-${qi}`,
      type: 'endNode',
      position: { x: pos.x - END_W / 2, y: pos.y - END_H / 2 },
      data: { label: scenario.quests[qi].sid, questSid: scenario.quests[qi].sid, color },
    })
  })

  // ── Group nodes (computed from child positions) ────────────────────────────
  const groupNodes: FlowNode[] = []

  scenario.quests.forEach((quest, qi) => {
    if (quest.subQuests.length === 0) return
    const color = QUEST_COLORS[qi % QUEST_COLORS.length]

    const children = quest.subQuests
      .map((_, sqi) => {
        const pos = g.node(`sq-${qi}-${sqi}`)
        return pos ? { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } : null
      })
      .filter((c): c is { x: number; y: number } => c !== null)

    if (children.length === 0) return

    const minX = Math.min(...children.map((c) => c.x))
    const minY = Math.min(...children.map((c) => c.y))
    const maxX = Math.max(...children.map((c) => c.x + NODE_W))
    const maxY = Math.max(...children.map((c) => c.y + NODE_H))

    const LABEL_H = 28
    groupNodes.push({
      id: `group-${qi}`,
      type: 'questGroup',
      position: {
        x: minX - GROUP_PAD,
        y: minY - GROUP_PAD - LABEL_H,
      },
      style: {
        width: maxX - minX + GROUP_PAD * 2,
        height: maxY - minY + GROUP_PAD * 2 + LABEL_H,
        pointerEvents: 'none',
      },
      data: { label: quest.sid, questSid: quest.sid, color },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
    })
  })

  // ── Edges ──────────────────────────────────────────────────────────────────
  const allNodeIds = new Set(contentNodes.map((n) => n.id))

  const edges: FlowEdge[] = edgeSpecs
    .filter(({ source, target }) => allNodeIds.has(source) && allNodeIds.has(target))
    .map((spec, i) => ({
      id: `e-${i}`,
      source: spec.source,
      target: spec.target,
      type: 'smoothstep',
      label: spec.label,
      labelStyle: { fontSize: 10 },
      labelBgStyle: { fill: 'hsl(var(--card))', opacity: 0.85 },
      style: spec.dash ? { strokeDasharray: spec.dash } : undefined,
    }))

  return { nodes: [...groupNodes, ...contentNodes], edges }
}
