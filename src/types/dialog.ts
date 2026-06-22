// ─── Dialog flow types matching HoMM Olden Era dialog JSON format ───────────────

export interface DialogAvatar {
  position: number              // 1–5
  icon: string                  // e.g. "icons/dialogue/dialog_hero_nature_3_Gingertail_large"
  isForeground: 'true' | 'false'
  animations?: string[]         // e.g. ["zoomIn"]
}

export interface DialogAnswer {
  text: string                                      // localization SID
  actions: Array<{ a: string; p?: string[] }>       // dialog flow actions (Go, End)
  mapActions?: Array<{ a: string; p?: string[] }>   // map actions (RemoveRes, etc.)
  requests?: Array<{ c: string; p?: string[] }>     // conditions for answer availability
}

export interface DialogSlide {
  id: string
  fon?: string
  avatars?: DialogAvatar[]
  title?: { sid: string; position?: number }
  text?: string                                     // localization SID (empty = action-only)
  mapActions?: Array<{ a: string; p?: string[] }>
  showAnimationsImmediately?: boolean
  invokeOnlyActions?: boolean
  next?: string                                     // id of next slide (auto-advance)
  end?: boolean                                     // terminal slide
  answers?: DialogAnswer[]                          // player choice slide
}

export interface DialogFlow {
  id: string
  localization: true
  slides: DialogSlide[]
}
