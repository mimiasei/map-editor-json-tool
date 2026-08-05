// ─── Dialog flow types matching HoMM Olden Era dialog JSON format ───────────────
// Field coverage derived from the game's own content: 769 flows / 5468 slides in
// Core.zip under DB/dialogs/dialogs/. The counts noted below are how many shipped
// slides use each field — they are why the editor exposes them.

/** Avatar slide-in animations observed in shipped dialogs. */
export const AVATAR_ANIMATIONS = ['zoomIn', 'zoomOut', 'appear'] as const
export type AvatarAnimation = (typeof AVATAR_ANIMATIONS)[number]

/** Avatar positions, left to right as rendered by the game. */
export const AVATAR_POSITIONS = [1, 2, 3, 4, 5] as const

/** How the game resolves the dialog's outcome. */
export const RESULT_DIALOG_VALUES = ['Interrupt', 'Default'] as const
export type ResultDialog = (typeof RESULT_DIALOG_VALUES)[number]

export interface DialogAvatar {
  position: number              // 1–5
  icon: string                  // e.g. "icons/dialogue/dialog_hero_nature_3_Gingertail_large"
  isForeground: 'true' | 'false' // string, not boolean, in the game format
  animations?: string[]         // e.g. ["zoomIn"]
  /** Pixel width override, as a string. Rare — 10 slides. */
  width?: string
  /** Alternative multi-icon form seen on a handful of slides. */
  icons?: string[]
}

/**
 * A dialog condition — a separate, smaller vocabulary from the main script conditions
 * (see src/schema/dialog-conditions.ts). `reqStatus: "false"` inverts the check: a
 * condition that IS met with reqStatus "false" fails the gate instead of passing it.
 * The game only ever writes the literal string "false" here (never "true") — an absent
 * field is the non-inverted case.
 */
export interface DialogCondition {
  c: string
  p?: string[]
  reqStatus?: 'false'
}

export interface DialogAnswer {
  text: string                                      // localization SID
  actions: Array<{ a: string; p?: string[] }>       // dialog flow actions (Go, End)
  mapActions?: Array<{ a: string; p?: string[] }>   // map actions (RemoveRes, etc.)
  requests?: DialogCondition[]                      // conditions for answer availability
  /** How `requests` combine. Default "And". */
  conditionsLogic?: 'And' | 'Or'
}

export interface DialogSlide {
  id: string
  /** Background image path. Present on nearly every shipped slide, usually "". */
  fon?: string
  avatars?: DialogAvatar[]
  title?: { sid: string; position?: number }
  text?: string                                     // localization SID (empty = action-only)
  mapActions?: Array<{ a: string; p?: string[] }>
  /** Story/flow actions run when the slide is shown — 180 slides. */
  actions?: Array<{ a: string; p?: string[] }>
  /** Map actions run when the dialog closes on this slide — 9 slides. */
  closeMapActions?: Array<{ a: string; p?: string[] }>
  /** Conditions gating whether this slide plays at all — 1544 slides. */
  dialogPlayConditions?: DialogCondition[]
  /** How `dialogPlayConditions` combine. Default "And". */
  conditionsLogic?: 'And' | 'Or'
  /** "Interrupt" halts queued game logic after the dialog; "Default" does not. */
  resultDialog?: ResultDialog | string
  /** Voice line path, e.g. "sounds/locale/dialogs/…" */
  sound?: string
  /** Notification key shown alongside the slide. */
  notification?: string
  /** Notification display time in seconds. */
  notificationDuration?: number
  showAnimationsImmediately?: boolean
  invokeOnlyActions?: boolean
  next?: string                                     // id of next slide (auto-advance)
  end?: boolean                                     // terminal slide
  answers?: DialogAnswer[]                          // player choice slide
}

export interface DialogFlow {
  id: string
  /** True for localized text SIDs. Shipped data also has false and absent. */
  localization?: boolean
  slides: DialogSlide[]
}
