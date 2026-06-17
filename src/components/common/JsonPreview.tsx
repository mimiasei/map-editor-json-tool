import { useScenarioStore } from '@/store/useScenarioStore'
import { exportScenario } from '@/lib/export'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function JsonPreview() {
  const { scenario } = useScenarioStore()
  const [copied, setCopied] = useState(false)

  const json = exportScenario(scenario)

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // Very simple syntax highlighting via CSS
  const highlighted = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'text-cyan-400' // number
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'text-sky-300' : 'text-green-300' // key : string
        } else if (/true|false/.test(match)) {
          cls = 'text-orange-400'
        } else if (/null/.test(match)) {
          cls = 'text-red-400'
        }
        return `<span class="${cls}">${match}</span>`
      },
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">JSON Preview</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <pre
          className="p-3 text-xs font-mono leading-relaxed text-foreground/90 whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </ScrollArea>
    </div>
  )
}
