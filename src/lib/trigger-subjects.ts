// ─── Subject-first trigger creation ──────────────────────────────────────────
// Hand-curated "what can I say about this kind of object" menus, used when a
// Trigger is seeded from a placed object selected on the Map Grid (see
// useViewBridgeStore's pendingSubjectSeed and TriggerVisualBuilder.tsx). Each
// verb records which CONDITION_REGISTRY/ACTION_REGISTRY param slot the
// seeded object's entitySid should be written into. Deliberately restricted
// to the four subjects Map Grid can already identify from existing
// PlacedObject data (no new capability system) — trigger zones/markers and a
// dedicated hero-verb menu are explicit follow-ups, not gaps here.

import type { LucideIcon } from 'lucide-react'
import { MapPin, Castle, DoorOpen, Users } from 'lucide-react'

export type SubjectKey = 'object' | 'castle' | 'portal' | 'squad'

export interface SubjectVerb {
  type: string
  kind: 'condition' | 'action'
  /** Index into the condition/action's `p` array that receives the seeded entitySid. */
  paramIndex: number
}

export interface SubjectDef {
  key: SubjectKey
  label: string
  icon: LucideIcon
  verbs: SubjectVerb[]
}

export const SUBJECT_DEFS: Record<SubjectKey, SubjectDef> = {
  object: {
    key: 'object',
    label: 'This object',
    icon: MapPin,
    verbs: [
      { type: 'ObjectInteractionBefore', kind: 'condition', paramIndex: 0 },
      { type: 'ObjectInteractionAfter', kind: 'condition', paramIndex: 0 },
      { type: 'ObjectCaptureEntity', kind: 'condition', paramIndex: 0 },
      { type: 'ObjectLose', kind: 'condition', paramIndex: 0 },
      { type: 'CaptureObject', kind: 'action', paramIndex: 0 },
      { type: 'LoseObject', kind: 'action', paramIndex: 0 },
      { type: 'SetQuestMarker', kind: 'action', paramIndex: 0 },
      { type: 'SetActiveQuestMarker', kind: 'action', paramIndex: 0 },
      { type: 'EventBankRefresh', kind: 'action', paramIndex: 0 },
      { type: 'InitiateInteract', kind: 'action', paramIndex: 0 },
      { type: 'EntityActionsOff', kind: 'action', paramIndex: 0 },
      { type: 'DeleteEntity', kind: 'action', paramIndex: 0 },
    ],
  },
  castle: {
    key: 'castle',
    label: 'This castle',
    icon: Castle,
    verbs: [
      { type: 'ObjectCaptureEntity', kind: 'condition', paramIndex: 0 },
      { type: 'ObjectLose', kind: 'condition', paramIndex: 0 },
      { type: 'BuildingConstruct', kind: 'condition', paramIndex: 2 },
      { type: 'BuildingOwn', kind: 'condition', paramIndex: 2 },
      { type: 'CaptureObject', kind: 'action', paramIndex: 0 },
      { type: 'LoseObject', kind: 'action', paramIndex: 0 },
      { type: 'UnlockBuildingCity', kind: 'action', paramIndex: 2 },
      { type: 'CreateBuildingCity', kind: 'action', paramIndex: 2 },
      { type: 'SetQuestMarker', kind: 'action', paramIndex: 0 },
      { type: 'SetActiveQuestMarker', kind: 'action', paramIndex: 0 },
      { type: 'DeleteEntity', kind: 'action', paramIndex: 0 },
    ],
  },
  portal: {
    key: 'portal',
    label: 'This portal',
    icon: DoorOpen,
    verbs: [
      { type: 'ObjectInteractionBefore', kind: 'condition', paramIndex: 0 },
      { type: 'ObjectInteractionAfter', kind: 'condition', paramIndex: 0 },
      { type: 'SetActivePortal', kind: 'action', paramIndex: 0 },
      { type: 'DeleteEntity', kind: 'action', paramIndex: 0 },
    ],
  },
  squad: {
    key: 'squad',
    label: 'This squad',
    icon: Users,
    verbs: [
      { type: 'SquadInteraction', kind: 'condition', paramIndex: 0 },
      { type: 'SquadKill', kind: 'condition', paramIndex: 0 },
      { type: 'InitiateAttack', kind: 'action', paramIndex: 0 },
      { type: 'IncreaseStrengthSquad', kind: 'action', paramIndex: 0 },
      { type: 'ReduceStrengthSquad', kind: 'action', paramIndex: 0 },
      { type: 'ChangeSquadReactionType', kind: 'action', paramIndex: 0 },
      { type: 'SetFlagEscape', kind: 'action', paramIndex: 0 },
      { type: 'SetFlagAutobattle', kind: 'action', paramIndex: 0 },
      { type: 'ChangeAlwaysDiplomacy', kind: 'action', paramIndex: 0 },
      { type: 'ChangeCampaignDiplomacy', kind: 'action', paramIndex: 0 },
      { type: 'DeleteSquad', kind: 'action', paramIndex: 0 },
    ],
  },
}
