import { useScenarioStore } from '@/store/useScenarioStore'
import { useMapContextStore } from '@/store/useMapContextStore'
import type { Action } from '@/types/scenario'
import { computeDialogActionCascade, describeDialogActionCascade } from '@/lib/dialog-cascade'

/** Guard invoked right before an action is actually removed from its trigger/
 *  interruption/dialog-slide array. If removing `action` would leave a dialog
 *  (and/or its localization tokens) unused anywhere else in the project, it
 *  confirms with the user and — only on confirmation — cascade-deletes them
 *  before returning `true` (proceed). Returns `true` immediately, with no
 *  prompt, when nothing would be orphaned (the common case — stays a single
 *  click exactly like a plain action delete does today). Returns `false` when
 *  the user cancels a cascade, aborting the whole removal. */
export function useDialogActionCascadeGuard(): (action: Action) => boolean {
  const scenario = useScenarioStore((s) => s.scenario)
  const dialogs = useScenarioStore((s) => s.dialogs)
  const customHeroes = useScenarioStore((s) => s.customHeroes)
  const customMapObjects = useScenarioStore((s) => s.customMapObjects)
  const customArtifacts = useScenarioStore((s) => s.customArtifacts)
  const customBuffs = useScenarioStore((s) => s.customBuffs)
  const removeDialogsAndTokens = useScenarioStore((s) => s.removeDialogsAndTokens)
  const mapEntities = useMapContextStore((s) => s.context?.entities)

  return (action: Action) => {
    const cascade = computeDialogActionCascade(action, {
      scenario,
      dialogs,
      customHeroes,
      customMapObjects,
      customArtifacts,
      customBuffs,
      mapEntities,
    })

    if (cascade.dialogsToDelete.length === 0 && cascade.tokensToDelete.length === 0) return true

    const confirmed = window.confirm(describeDialogActionCascade(cascade, mapEntities !== undefined))
    if (!confirmed) return false

    removeDialogsAndTokens(cascade.dialogsToDelete, cascade.tokensToDelete)
    return true
  }
}
