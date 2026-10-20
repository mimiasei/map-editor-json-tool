// Holds the text of a story while the user reviews it: English (the base) and,
// when the writing language is another one, that language beside it. Texts start
// as the built-in English defaults and are upgraded in place by the text writer
// when it is ready. Any failure leaves the built-in text and, at most, a short
// note. Nothing here touches the project; the dialog reads a snapshot on Create.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TextSpec } from '@/types/story'
import { offlineText } from '@/lib/stories/text'
import {
  describeError,
  generateTexts,
  translateRequest,
  writeRequest,
  type TextWriterError,
} from '@/lib/text-writer'

interface Options {
  /** The specs of the generated story, or null while there is none. */
  specs: TextSpec[] | null
  /** Built-in English text per token. */
  defaults: Record<string, string>
  /** Changes whenever the story is regenerated; discards edits and starts a new run. */
  resetKey: string
  /** Writing language (game language id). Non-English needs `ready`. */
  lang: string
  ready: boolean
}

export function useStoryTexts({ specs, defaults, resetKey, lang, ready }: Options) {
  const [en, setEnState] = useState<Record<string, string>>({})
  const [native, setNativeState] = useState<Record<string, string>>({})
  const [stale, setStale] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const run = useRef(0)

  const nonEnglish = ready && lang !== 'english'

  // New story (or settings): drop edits and, if the text writer is ready, write it.
  useEffect(() => {
    const id = ++run.current
    setEnState({})
    setNativeState({})
    setStale(new Set())
    setNote(null)
    if (!specs || !ready) {
      setBusy(false)
      return
    }
    const failed = (e: unknown) => {
      if (id !== run.current) return
      setNote(describeError(e as TextWriterError))
    }
    setBusy(true)
    void (async () => {
      try {
        if (!nonEnglish) {
          const res = await generateTexts(specs.map((s) => writeRequest(s, 'english')))
          if (id === run.current) setEnState(res)
          return
        }
        const nat = await generateTexts(specs.map((s) => writeRequest(s, lang)))
        if (id !== run.current) return
        setNativeState(nat)
        try {
          const english = await generateTexts(specs.map((s) => translateRequest(s, lang, 'english', nat[s.id])))
          if (id === run.current) setEnState(english)
        } catch (e) {
          // Keep the native text; the English text stays built-in and is marked as not matching.
          if (id === run.current) setStale(new Set(specs.map((s) => s.id)))
          failed(e)
        }
      } catch (e) {
        failed(e)
      } finally {
        if (id === run.current) setBusy(false)
      }
    })()
    // `specs` identity changes with resetKey; depending on resetKey alone avoids re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, lang, ready])

  const english = useCallback((token: string) => en[token] ?? defaults[token] ?? '', [en, defaults])
  const nativeText = useCallback((token: string) => native[token] ?? '', [native])

  const setEnglish = useCallback((token: string, text: string) => {
    setEnState((p) => ({ ...p, [token]: text }))
    setStale((p) => {
      if (!p.has(token)) return p
      const n = new Set(p)
      n.delete(token)
      return n
    })
  }, [])

  const setNative = useCallback((token: string, text: string) => {
    setNativeState((p) => ({ ...p, [token]: text }))
    setStale((p) => new Set(p).add(token))
  }, [])

  /** A fresh version of one line. */
  const another = useCallback(
    async (spec: TextSpec) => {
      if (!ready) {
        setEnglish(spec.id, offlineText(spec, Math.random))
        return
      }
      setBusy(true)
      setNote(null)
      try {
        if (!nonEnglish) {
          const res = await generateTexts([writeRequest(spec, 'english')])
          setEnglish(spec.id, res[spec.id])
        } else {
          const res = await generateTexts([writeRequest(spec, lang)])
          setNativeState((p) => ({ ...p, [spec.id]: res[spec.id] }))
          const eng = await generateTexts([translateRequest(spec, lang, 'english', res[spec.id])])
          setEnglish(spec.id, eng[spec.id])
        }
      } catch (e) {
        setNote(describeError(e as TextWriterError))
        if (!nonEnglish) setEnglish(spec.id, offlineText(spec, Math.random))
      } finally {
        setBusy(false)
      }
    },
    [ready, nonEnglish, lang, setEnglish],
  )

  /** Re-derive the English text of one line from its writing-language text. */
  const updateEnglish = useCallback(
    async (spec: TextSpec) => {
      if (!ready || !native[spec.id]) return
      setBusy(true)
      setNote(null)
      try {
        const eng = await generateTexts([translateRequest(spec, lang, 'english', native[spec.id])])
        setEnglish(spec.id, eng[spec.id])
      } catch (e) {
        setNote(describeError(e as TextWriterError))
      } finally {
        setBusy(false)
      }
    },
    [ready, native, lang, setEnglish],
  )

  /** Everything needed to commit: English per token, and the writing language if any. */
  const snapshot = useCallback(() => {
    const englishAll: Record<string, string> = {}
    for (const s of specs ?? []) englishAll[s.id] = en[s.id] ?? defaults[s.id] ?? ''
    return { english: englishAll, native: nonEnglish ? { ...native } : {} }
  }, [specs, en, defaults, native, nonEnglish])

  return { english, native: nativeText, stale, busy, note, setEnglish, setNative, another, updateEnglish, snapshot, nonEnglish }
}
