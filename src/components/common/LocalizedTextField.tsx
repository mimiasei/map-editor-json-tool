// ─── Presentational half of the SID+text field pair — see useLocalizedTextField ─
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, Info } from 'lucide-react'
import type { ReactNode } from 'react'

interface LocalizedTextFieldProps {
  idPrefix: string
  /** Full label shown when this dialog is managing a localization token,
   *  e.g. "Naming SID", "Description SID". */
  managedSidLabel: string
  /** Full label shown when it isn't, e.g.
   *  "Hero name (written directly, no localization)". */
  unmanagedLabel: string
  /** Optional trailing content after the label, e.g. `for <code>sid</code>`. */
  sidLabelSuffix?: ReactNode
  /** Label for the text input, e.g. "Hero name text". */
  textLabel: string
  sidValue: string
  textValue: string
  autoManageLoc: boolean
  onSidChange: (v: string) => void
  onTextChange: (v: string) => void
  isDuplicate: boolean
  optional?: boolean
  showFirstTimeNote?: boolean
  autoFocus?: boolean
  /** Adds the `border-t pt-3` divider this dialog family uses between
   *  stacked fields — omit for the first field in a section. */
  bordered?: boolean
}

export default function LocalizedTextField({
  idPrefix,
  managedSidLabel,
  unmanagedLabel,
  sidLabelSuffix,
  textLabel,
  sidValue,
  textValue,
  autoManageLoc,
  onSidChange,
  onTextChange,
  isDuplicate,
  optional,
  showFirstTimeNote,
  autoFocus,
  bordered,
}: LocalizedTextFieldProps) {
  return (
    <div className={bordered ? 'border-t border-border pt-3 space-y-1.5' : 'space-y-1.5'}>
      <Label htmlFor={`${idPrefix}-sid`}>
        {autoManageLoc ? managedSidLabel : unmanagedLabel}
        {sidLabelSuffix}
        {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
      </Label>
      <Input
        id={`${idPrefix}-sid`}
        value={sidValue}
        onChange={(e) => onSidChange(e.target.value)}
        className="font-mono"
        autoFocus={autoFocus}
      />

      {autoManageLoc && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-text`}>{textLabel}</Label>
          <Input
            id={`${idPrefix}-text`}
            value={textValue}
            onChange={(e) => onTextChange(e.target.value)}
          />
        </div>
      )}

      {showFirstTimeNote && autoManageLoc && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          A localization token will be created automatically using the SID above.
        </p>
      )}

      {isDuplicate && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            "{sidValue.trim()}" is already used by another entity or token.
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
