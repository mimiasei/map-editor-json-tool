import { useState } from 'react'
import { useTemplateIndex, loadTemplate } from '@/hooks/useGuideData'
import { useGuideStore } from '@/store/useGuideStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import { importScenario } from '@/lib/import'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function TemplatePickerDialog({ open, onOpenChange }: Props) {
  const templateIndex = useTemplateIndex()
  const { dismissedAnnotations, clearDismissedAnnotations } = useGuideStore()
  const { setScenario, setMapName, setDialogFlow, setLocalizationBatch } = useScenarioStore()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  void dismissedAnnotations // used for guard below

  const handleLoad = async () => {
    if (!selectedId) return
    setLoading(true)
    setError(null)

    try {
      const raw = await loadTemplate(selectedId)
      const json = JSON.stringify(raw)
      const result = importScenario(json)

      if (result.scenario) {
        setScenario(result.scenario)
        setMapName(result.mapName)
        for (const [id, flow] of Object.entries(result.dialogs)) {
          setDialogFlow(id, flow)
        }
        if (Object.keys(result.localization).length > 0) {
          setLocalizationBatch(result.localization)
        }

        // Store template annotations in guide store
        const rawObj = raw as Record<string, unknown>
        if (rawObj._annotations && typeof rawObj._annotations === 'object') {
          useGuideStore.setState({
            templateAnnotations: rawObj._annotations as Record<string, string>,
          })
          // Clear previously dismissed annotations so new template annotations show fresh
          clearDismissedAnnotations()
        }

        onOpenChange(false)
      } else {
        setError('Failed to load template: ' + result.errors.join(', '))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const selectedTemplate = templateIndex.templates.find((t) => t.id === selectedId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New from Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {templateIndex.categories.map((cat) => {
            const templates = templateIndex.templates.filter((t) => t.category === cat.id)
            if (templates.length === 0) return null

            return (
              <div key={cat.id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {cat.label}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        'text-left rounded-md border p-3 space-y-1 transition-colors',
                        selectedId === t.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50 hover:bg-accent/50'
                      )}
                    >
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleLoad}
            disabled={!selectedTemplate || loading}
          >
            {loading ? 'Loading…' : 'Load Template'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
