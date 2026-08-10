// ─── SID+text field with "slug follows title" auto-management ───────────────
// Extracted from SetDisplayNameDialog.tsx (issue #139) so the same mechanics
// can back more than one field in more than one dialog (issue #141's hero
// editor needs it for name/description/motto too, on top of the fields
// SetDisplayNameDialog already has). See LocalizedTextField.tsx for the
// paired presentational component.

import { useState } from 'react'
import { generateDisplayNameSid } from '@/lib/slugify'

interface UseLocalizedTextFieldOptions {
  /** Whether this dialog is currently managing a localization token for this
   *  field at all — while false, the SID field's raw value is written
   *  directly and the text field/auto-follow behavior are both inert. */
  autoManageLoc: boolean
  /** Every SID this field's generated value must not collide with — the
   *  caller is responsible for excluding this field's own current/previous
   *  SID first, so an unedited value never gets bumped to a "_2" suffix
   *  against itself. */
  existingSids: string[]
  /** Passed to generateDisplayNameSid so different fields on the same entity
   *  don't generate identically-shaped SIDs (e.g. "_desc_sid" vs "_name_sid"). */
  suffix?: string
  /** Optional fields (e.g. a hero's description/motto) clear their SID when
   *  the text is cleared, rather than falling back to generateDisplayNameSid's
   *  default "name" placeholder — a required field (e.g. the primary display
   *  name) always gets a generated SID, even from empty text. */
  optional?: boolean
}

export function useLocalizedTextField({ autoManageLoc, existingSids, suffix = 'name_sid', optional }: UseLocalizedTextFieldOptions) {
  const [sidValue, setSidValueRaw] = useState('')
  const [textValue, setTextValueRaw] = useState('')
  // Tracks whether the user has directly typed into the SID field — while
  // false, the SID field auto-follows the text field (slug-follows-title,
  // same pattern as a URL slug field), so the user sees a live suggestion
  // without it silently overwriting a SID they've already customized.
  const [sidTouched, setSidTouched] = useState(false)

  /** Re-seed all three pieces of state, e.g. when the dialog opens for a
   *  different entity. An existing SID is never auto-reflowed; only a
   *  genuinely blank, first-time field starts in "follow the text" mode. */
  const reset = (sid: string, text: string) => {
    setSidValueRaw(sid)
    setTextValueRaw(text)
    setSidTouched(!!sid)
  }

  const handleTextChange = (text: string) => {
    setTextValueRaw(text)
    if (!sidTouched && autoManageLoc) {
      if (optional && !text.trim()) {
        setSidValueRaw('')
      } else {
        setSidValueRaw(generateDisplayNameSid(text, existingSids, suffix))
      }
    }
  }

  const handleSidChange = (v: string) => {
    setSidValueRaw(v)
    setSidTouched(true)
  }

  /** Called when auto-manage is switched back on — backfills the text field
   *  from whatever localization token the current SID already has, if the
   *  text field is otherwise empty. */
  const setTextIfEmpty = (text: string) => {
    if (!textValue.trim()) setTextValueRaw(text)
  }

  return {
    sidValue,
    textValue,
    trimmedSid: sidValue.trim(),
    trimmedText: textValue.trim(),
    reset,
    handleTextChange,
    handleSidChange,
    setTextIfEmpty,
  }
}

export type LocalizedTextFieldState = ReturnType<typeof useLocalizedTextField>
