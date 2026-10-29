// Settings for the optional "Text writer": which service, the user's key, and
// the one-time consent that story text is sent to that service. The key is
// stored by the desktop app in the operating system's credential store; this
// dialog never keeps it after saving.

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink } from '@/components/ui/icons'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  PROVIDERS,
  clearKey,
  describeError,
  getProvider,
  hasConsent,
  hasKey,
  onWriterStatus,
  setConsent,
  setKey,
  setProvider,
  testKey,
  type Provider,
  type TextWriterError,
} from '@/lib/text-writer'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after the key or consent changed, so callers can re-check readiness. */
  onChanged?: () => void
}

export default function TextWriterSettingsDialog({ open, onOpenChange, onChanged }: Props) {
  const { t } = useTranslation()
  const [provider, setProviderState] = useState<Provider>(getProvider)
  const [keyInput, setKeyInput] = useState('')
  const [consent, setConsentState] = useState(hasConsent)
  const [stored, setStored] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [status, setStatus] = useState('')
  const [seconds, setSeconds] = useState(0)

  const refresh = useCallback(async (p: Provider) => setStored(await hasKey(p)), [])

  // While a request runs: the step Rust reports and a seconds counter.
  useEffect(() => {
    if (!busy) return
    setStatus(t('story.textWriterSettingsDialog.starting'))
    setSeconds(0)
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    let off: (() => void) | undefined
    let cancelled = false
    void onWriterStatus(setStatus).then((fn) => {
      if (cancelled) fn()
      else off = fn
    })
    return () => {
      cancelled = true
      clearInterval(timer)
      off?.()
    }
  }, [busy])

  useEffect(() => {
    if (open) {
      setConsentState(hasConsent())
      void refresh(provider)
    }
  }, [open, provider, refresh])

  const info = PROVIDERS.find((p) => p.id === provider)!

  const pickProvider = (p: Provider) => {
    setProviderState(p)
    setProvider(p)
    setKeyInput('')
    setMessage(null)
    onChanged?.()
  }

  const openKeyPage = async () => {
    try {
      const { open: openUrl } = await import('@tauri-apps/plugin-shell')
      await openUrl(info.keyUrl)
    } catch {
      window.open(info.keyUrl, '_blank', 'noopener')
    }
  }

  const failure = (e: unknown) => {
    const err = e as TextWriterError
    return describeError(err) ?? err.message ?? t('story.textWriterSettingsDialog.somethingWentWrong')
  }

  const save = async () => {
    setBusy(true)
    setMessage(null)
    try {
      await setKey(provider, keyInput.trim())
      setKeyInput('')
      setConsent(true)
      const model = await testKey(provider)
      setMessage({ ok: true, text: `Saved. The text writer is ready${model ? ` (model: ${model})` : ''}.` })
    } catch (e) {
      setMessage({ ok: false, text: failure(e) })
    } finally {
      await refresh(provider)
      setBusy(false)
      onChanged?.()
    }
  }

  // Checks the already saved key and the connection with one tiny real request.
  const test = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const model = await testKey(provider)
      setMessage({ ok: true, text: `Connected to ${info.label}${model ? ` (model: ${model})` : ''}. The saved key works.` })
    } catch (e) {
      setMessage({ ok: false, text: failure(e) })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await clearKey(provider)
      setMessage({ ok: true, text: t('story.textWriterSettingsDialog.keyRemoved') })
    } catch (e) {
      setMessage({ ok: false, text: failure(e) })
    } finally {
      await refresh(provider)
      setBusy(false)
      onChanged?.()
    }
  }

  const toggleConsent = (on: boolean) => {
    setConsentState(on)
    setConsent(on)
    onChanged?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('story.textWriterSettingsDialog.textWriter')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t('story.textWriterSettingsDialog.optionalWithAFreeKey')}
          </p>

          <div className="space-y-1.5">
            <Label>{t('story.textWriterSettingsDialog.service')}</Label>
            <div className="flex gap-1.5">
              {PROVIDERS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  aria-pressed={provider === p.id} variant={provider === p.id ? 'default' : 'outline'}
                  onClick={() => pickProvider(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="text-writer-key">{t('story.textWriterSettingsDialog.key')}</Label>
            <p className="text-xs text-muted-foreground">
              {info.keyHelp}{' '}
              <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={openKeyPage}>
                {t('story.textWriterSettingsDialog.openPage')} <ExternalLink className="h-3 w-3" />
              </button>
            </p>
            <Input
              id="text-writer-key"
              type="password"
              autoComplete="off"
              value={keyInput}
              placeholder={stored ? t('story.textWriterSettingsDialog.aKeyIsSavedPaste') : t('story.textWriterSettingsDialog.pasteYourKey')}
              onChange={(e) => setKeyInput(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={consent} onCheckedChange={(c) => toggleConsent(c === true)} className="mt-0.5" />
            <span>
              {t('story.textWriterSettingsDialog.iUnderstandThatTextWritten', { label: info.label })}
            </span>
          </label>

          {stored && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t('story.textWriterSettingsDialog.keySaved', { name: info.label })}
            </p>
          )}

          {busy && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t('story.textWriterSettingsDialog.checkingS', { status, seconds })}
            </p>
          )}

          {message && !busy && (
            <Alert variant={message.ok ? 'default' : 'destructive'}>
              {!message.ok && <AlertTriangle className="h-4 w-4" />}
              <AlertDescription className={message.ok ? '' : 'ml-2'}>{message.text}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          {stored && (
            <Button variant="outline" onClick={test} disabled={busy || !consent} title={consent ? undefined : t('story.textWriterSettingsDialog.tickTheBoxAboveFirst')}>
              {busy ? t('story.textWriterSettingsDialog.checking') : t('story.textWriterSettingsDialog.testConnection')}
            </Button>
          )}
          {stored && (
            <Button variant="ghost" onClick={remove} disabled={busy}>
              {t('story.textWriterSettingsDialog.removeKey')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('ui.close')}
          </Button>
          <Button onClick={save} disabled={busy || !consent || keyInput.trim().length < 8}>
            {busy ? t('story.textWriterSettingsDialog.checking') : t('story.textWriterSettingsDialog.saveAndTest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
