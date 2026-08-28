// ─── H3M post-object-table global timed events ───────────────────────────────
// Ported from the reference project (leviritchie/homm3-olden-stock-translator)
// `h3m_global_events.py`, used with the author's explicit permission.

import { H3mWalker, RESOURCES_COUNT } from './h3m-object-walk'
import { H3M_VERSION_SOD, H3M_VERSION_HOTA } from './h3m-format'

const GLOBAL_EVENT_ZERO_PAD_BYTES = 16

export interface H3mGlobalTimedEvent {
  index: number
  name: string
  message: string
  resources: number[]
  playersMask: number
  humanAffected: number | null
  computerAffected: boolean
  firstOccurrence: number
  nextOccurrence: number
  /** H3M `firstOccurrence` is 0-based (0 = calendar day 1). */
  triggerDay: number
  hota?: { affectedDifficulties: number; usesEventSystem: boolean; eventId?: number; synchronizeObjects?: boolean }
}

/** Read the tail of timed-event records right after the object table ends
 *  (RoE/AB/SoD; HotA adds extra trailing fields per event). Returns an empty
 *  event list, not an error, when the walk consumed the whole file. */
export function readGlobalTimedEvents(data: Uint8Array, walkEndOffset: number, h3mVersion: number): H3mGlobalTimedEvent[] {
  if (walkEndOffset < 0 || walkEndOffset > data.length) throw new Error(`walkEndOffset out of range: ${walkEndOffset}`)
  const walker = new H3mWalker(data)
  walker.seek(walkEndOffset)
  if (walker.tell() === data.length) return []

  const eventCount = walker.readU32()
  if (eventCount > 256) throw new Error(`Implausible global timed event count ${eventCount}`)
  const hasHumanAffected = h3mVersion >= H3M_VERSION_SOD

  const events: H3mGlobalTimedEvent[] = []
  for (let index = 0; index < eventCount; index++) {
    const name = walker.readString()
    const message = walker.readString(1_000_000)
    const resources = Array.from({ length: RESOURCES_COUNT }, () => walker.readI32())
    const playersMask = walker.readU8()
    const humanAffected = hasHumanAffected ? walker.readU8() : null
    const computerAffected = walker.readU8() !== 0
    const firstOccurrence = walker.readU16()
    const nextOccurrence = walker.readU16()
    const padOffset = walker.tell()
    const pad = walker.readBytes(GLOBAL_EVENT_ZERO_PAD_BYTES)
    for (const b of pad) {
      if (b !== 0) throw new Error(`Global timed event ${index} expected ${GLOBAL_EVENT_ZERO_PAD_BYTES} zero bytes at ${padOffset}`)
    }
    const event: H3mGlobalTimedEvent = {
      index, name, message, resources, playersMask, humanAffected, computerAffected,
      firstOccurrence, nextOccurrence, triggerDay: firstOccurrence + 1,
    }
    if (h3mVersion === H3M_VERSION_HOTA) {
      const affectedDifficulties = walker.readU32()
      const usesEventSystem = walker.readBool()
      event.hota = { affectedDifficulties, usesEventSystem }
      if (usesEventSystem) {
        event.hota.eventId = walker.readI32()
        event.hota.synchronizeObjects = walker.readBool()
      }
    }
    events.push(event)
  }

  const remaining = data.length - walker.tell()
  if (remaining > 0) {
    for (let i = walker.tell(); i < data.length; i++) {
      if (data[i] !== 0) throw new Error(`Non-zero bytes remain after global timed events at ${walker.tell()}`)
    }
  }
  return events
}

/** Probe whether `walkEndOffset` really is the global-timed-events table —
 *  returns `null` on any decode failure instead of throwing, since callers
 *  use this to disambiguate real end-of-object-table from other tail shapes. */
export function tryReadGlobalTimedEvents(data: Uint8Array, walkEndOffset: number, h3mVersion: number): H3mGlobalTimedEvent[] | null {
  try {
    return readGlobalTimedEvents(data, walkEndOffset, h3mVersion)
  } catch {
    return null
  }
}
