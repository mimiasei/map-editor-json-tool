import { useState, useCallback, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useThemeSettingsStore, DEFAULT_LIGHT_COLORS, DEFAULT_FONT_SIZE, type ThemeColors } from '@/store/useThemeSettingsStore'
import { isTauri, openFile, saveFile } from '@/lib/native-fs'

interface ThemeEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// ─── Color field definitions ───────────────────────────────────────────────

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; description: string }[] = [
  { key: 'appBackground',  label: 'App background',     description: 'Outermost app background (behind all panels)' },
  { key: 'background',    label: 'Background',         description: 'Main page background color' },
  { key: 'columnLeft',    label: 'Left column',        description: 'Tree/scenario panel background' },
  { key: 'columnCenter',  label: 'Center column',      description: 'Editor panel background' },
  { key: 'columnRight',   label: 'Right column',       description: 'JSON preview panel background' },
  { key: 'popover',       label: 'Dropdowns',          description: 'Dropdown menus and popovers' },
  { key: 'primary',       label: 'Primary button',     description: 'Accent color for primary actions' },
  { key: 'secondary',     label: 'Secondary button',   description: 'Background for secondary actions' },
]

// ─── Single color row with swatch + picker popover ────────────────────────

function ColorRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: string
  onChange: (hex: string) => void
}) {
  const [hex, setHex] = useState(value)

  // Keep local state in sync when the store value changes externally
  // (e.g. revert, theme switch). useEffect avoids the render-time setState
  // anti-pattern and correctly handles all external updates.
  useEffect(() => {
    setHex(value)
  }, [value])

  const handleChange = (newHex: string) => {
    setHex(newHex)
    onChange(newHex)
  }

  const handleInputChange = (raw: string) => {
    const normalized = raw.startsWith('#') ? raw : `#${raw}`
    setHex(normalized)
    if (/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      onChange(normalized)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="h-7 w-7 rounded border border-border shadow-sm shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: hex }}
            aria-label={`Pick color for ${label}`}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" side="right" align="start">
          <HexColorPicker color={hex} onChange={handleChange} />
          <Input
            className="mt-2 h-7 text-xs font-mono"
            value={hex}
            maxLength={7}
            onChange={(e) => handleInputChange(e.target.value)}
          />
        </PopoverContent>
      </Popover>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  )
}

// ─── Main dialog ──────────────────────────────────────────────────────────

export default function ThemeEditorDialog({ open, onOpenChange }: ThemeEditorDialogProps) {
  const {
    themes,
    activeThemeId,
    setActiveTheme,
    updateTheme,
    createTheme,
    deleteTheme,
    revertDefault,
  } = useThemeSettingsStore()

  const [newThemeName, setNewThemeName] = useState('')
  const [showNewThemeInput, setShowNewThemeInput] = useState(false)

  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? themes[0]
  const isDesktop = isTauri()
  const isDefault = activeTheme.id === 'default-light'

  const handleColorChange = useCallback(
    (key: keyof ThemeColors, hex: string) => {
      updateTheme(activeTheme.id, { [key]: hex })
    },
    [activeTheme.id, updateTheme],
  )

  const handleFontSizeChange = useCallback(
    (value: number) => {
      updateTheme(activeTheme.id, { fontSize: value })
    },
    [activeTheme.id, updateTheme],
  )

  const handleCreateTheme = () => {
    const name = newThemeName.trim() || 'Custom Theme'
    createTheme(name)
    setNewThemeName('')
    setShowNewThemeInput(false)
  }

  const handleExport = async () => {
    const json = JSON.stringify(activeTheme, null, 2)
    await saveFile(json, `${activeTheme.name.replace(/\s+/g, '-').toLowerCase()}-theme.json`)
  }

  const handleImport = async () => {
    const result = await openFile()
    if (!result) return
    try {
      const parsed = JSON.parse(result.content)
      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.name === 'string' &&
        typeof parsed.colors === 'object' &&
        typeof parsed.fontSize === 'number'
      ) {
        createTheme(parsed.name)
        // updateTheme for the newly created theme (it's now active)
        const newId = useThemeSettingsStore.getState().activeThemeId
        updateTheme(newId, { ...parsed.colors, fontSize: parsed.fontSize, name: parsed.name })
      }
    } catch {
      // Invalid file — silently ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Theme Editor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* ── Theme selector (desktop: multiple themes; web: single light) ── */}
          {isDesktop ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Active theme</Label>
              <div className="flex gap-2">
                <Select value={activeThemeId} onValueChange={setActiveTheme}>
                  <SelectTrigger className="flex-1 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isDefault && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteTheme(activeTheme.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>

              {/* New theme */}
              {showNewThemeInput ? (
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-sm flex-1"
                    placeholder="Theme name"
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTheme() }}
                    autoFocus
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={handleCreateTheme}>
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowNewThemeInput(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => setShowNewThemeInput(true)}>
                  + New theme
                </Button>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Editing light theme</p>
          )}

          <Separator />

          {/* ── Color pickers ── */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Colors</Label>
            <div className="space-y-3 pt-1">
              {COLOR_FIELDS.map(({ key, label, description }) => (
                <ColorRow
                  key={key}
                  label={label}
                  description={description}
                  value={activeTheme.colors[key]}
                  onChange={(hex) => handleColorChange(key, hex)}
                />
              ))}
            </div>
          </div>

          <Separator />

          {/* ── Font size ── */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Font size</Label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={18}
                step={1}
                value={activeTheme.fontSize}
                onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-mono w-10 text-right tabular-nums">
                {activeTheme.fontSize}px
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground px-0.5">
              <span>10</span>
              <span>18</span>
            </div>
          </div>

          <Separator />

          {/* ── Actions ── */}
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={isDefault ? revertDefault : () => {
                updateTheme(activeTheme.id, {
                  ...DEFAULT_LIGHT_COLORS,
                  fontSize: DEFAULT_FONT_SIZE,
                })
              }}
            >
              Revert to defaults
            </Button>
            {isDesktop && (
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleImport}>
                  Import
                </Button>
                <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={handleExport}>
                  Export
                </Button>
              </div>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
