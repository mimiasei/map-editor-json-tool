# Plan: UI Layout Refinement — Issue #69

## Goal

Refine the visual style and density of the editor UI, targeting the desktop (Tauri) build as the primary experience while keeping the web build functional. The result should feel like a purposeful, compact desktop tool rather than a generic web app.

## Design reference

A reference desktop editor for the same game genre was studied in detail. The following patterns are adopted as inspiration (colors are not copied):

| Aspect | Reference | Current editor | Target |
|---|---|---|---|
| Base font size | 12px | ~14px (Tailwind `text-sm`) | 12–13px |
| Button height | 38px (`8px 12px` padding) | 40px (`h-10`) | 32px (`h-8`) |
| Icon button size | 38×38px | 40×40px (`h-10 w-10`) | 32×32px (`h-8 w-8`) |
| Button border radius | 8px | 8px (`--radius: 0.5rem`) | 6px |
| Toolbar height | 72px (ref has many controls) | 48px (`h-12`) | 40px (`h-10`) |
| Button transition | `all 150ms ease` + `scale(0.97)` on active | none explicit | `150ms` + `active:scale-[0.97]` |
| Hover state | Border shifts to accent + bg tint | Ghost background only | Border highlight + bg tint |
| Dropdown item padding | ~`8px 12px` | `px-2 py-1.5 text-sm` | `px-2 py-1 text-xs` |
| Input fields | `8px 10px` pad, 12px font | shadcn defaults | `py-1.5 px-2.5`, 13px font |

## Color scheme: Muted emerald

The current editor uses warm orange/amber (`hsl(35 90% 48–55%)`) as its primary accent. This is replaced with a muted forest-green/emerald that is visually distinct, works well on dark backgrounds, and fits the fantasy map tool aesthetic.

### Dark mode (`.dark`)

| Token | Current HSL | New HSL | Approx hex |
|---|---|---|---|
| `--primary` | `35 90% 55%` (amber) | `160 45% 40%` | `#2d8a6e` |
| `--primary-foreground` | `20 14% 4%` (near-black) | `0 0% 100%` | `#ffffff` |
| `--accent` | `20 14% 15%` (warm dark) | `160 25% 16%` | `#1a3d33` |
| `--accent-foreground` | `60 9% 98%` | `160 30% 85%` | `#b8d9cf` |
| `--ring` | `35 90% 55%` (amber) | `160 45% 40%` | `#2d8a6e` |

### Light mode (`:root` / no `.dark`)

| Token | New HSL | Approx hex |
|---|---|---|
| `--primary` | `160 50% 32%` | `#277a5e` |
| `--primary-foreground` | `0 0% 100%` | `#ffffff` |
| `--accent` | `160 20% 92%` | `#daf0ea` |
| `--accent-foreground` | `160 40% 20%` | `#1a4d3a` |
| `--ring` | `160 50% 32%` | `#277a5e` |

All other tokens (backgrounds, borders, destructive, muted, popover) remain unchanged.

## Specific file changes

### 1. `src/index.css` — global styles
- Set `font-size: 13px` on `html` or `body` for desktop density
- Add `button { active: scale(0.97) }` via Tailwind plugin or direct CSS — gives tactile press feedback
- Update `--primary`, `--primary-foreground`, `--accent`, `--accent-foreground`, `--ring` HSL values in both `:root` and `.dark` blocks
- Reduce `--radius` from `0.5rem` to `0.375rem` (6px)

### 2. `src/components/ui/button.tsx` — size tokens
- `default`: `h-10 px-4 py-2` → `h-8 px-3 py-1.5`
- `sm`: `h-9 rounded-md px-3` → `h-7 px-2 text-xs`
- `lg`: `h-11 px-8` → `h-9 px-6`
- `icon`: `h-10 w-10` → `h-8 w-8`
- Base classes: add `transition-all duration-150 active:scale-[0.97]`
- `outline` variant: add `hover:border-primary` so the border shifts to accent on hover (matching reference)

### 3. `src/components/ui/dropdown-menu.tsx` — density
- `DropdownMenuItem`: `px-2 py-1.5 text-sm` → `px-2 py-1 text-xs`
- `DropdownMenuSeparator`: `my-1` → `my-0.5`
- `DropdownMenuLabel`: `px-2 py-1.5 text-sm` → `px-2 py-1 text-xs font-semibold`
- `DropdownMenuContent`: add `text-xs` as default

### 4. `src/components/layout/Toolbar.tsx` — height and padding
- Root div: `h-12` → `h-10`
- Padding: `px-3` → `px-2`
- Icon-only buttons already use `h-8 w-8` — verify and make consistent
- Icon sizes: ensure all are `h-4 w-4` (16px) — matches reference

### 5. `src/components/common/EntityCombobox.tsx` — input and list density
- Input: reduce height via `h-8` or equivalent, font `text-xs`
- Command list items: tighten padding to match new dropdown density

### 6. Dark theme audit
- Inspect all popover, dialog, and sheet backgrounds — ensure none use raw `white` or `bg-white`
- Verify `bg-popover`, `bg-card`, `bg-background` are used consistently
- Check `ThumbnailExtractDialog.tsx` and `AppShell.tsx` for any hard-coded light colors

## What does not change

- Overall 3-panel resizable layout
- shadcn/ui as the component library (no migration)
- Tailwind CSS as the styling approach (no raw CSS rewrite)
- Data model, catalog types, Tauri commands
- Component structure and prop APIs

## Order of implementation

1. `src/index.css` — color tokens + font size + radius
2. `src/components/ui/button.tsx` — size variants + transitions
3. `src/components/ui/dropdown-menu.tsx` — density
4. `src/components/layout/Toolbar.tsx` — height/padding pass
5. `src/components/common/EntityCombobox.tsx` — input/list density
6. Dark theme audit across remaining components
7. Manual smoke test: open editor in Tauri dev build, open in browser, verify no regressions

## Acceptance criteria

- [ ] Toolbar height is 40px; buttons are 32px tall
- [ ] Dropdown items use 12px font and tighter padding
- [ ] Primary/accent color is muted emerald throughout — no amber/orange remnants
- [ ] `active:scale-[0.97]` gives tactile press feel on all buttons
- [ ] Outline/ghost buttons show a border shift toward the accent on hover
- [ ] Dark theme has no unstyled white/light pockets
- [ ] Web build renders correctly at 1280px+ browser width
- [ ] No TypeScript errors; no broken layouts
