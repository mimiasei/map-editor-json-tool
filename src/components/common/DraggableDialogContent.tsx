"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { DialogPortal, DialogOverlay } from "@/components/ui/dialog"
import { readDialogGeometry, writeDialogGeometry } from "@/lib/dialog-geometry"

// ---------------------------------------------------------------------------
// Context — lets DraggableDialogDragHandle reach the pointer handlers without
// prop-drilling through arbitrary children.
// ---------------------------------------------------------------------------

interface DragHandleCtx {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
}

const DragHandleContext = React.createContext<DragHandleCtx | null>(null)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

interface DragState {
  startMouseX: number
  startMouseY: number
  startPosX: number
  startPosY: number
}

interface ResizeState {
  edge: ResizeEdge
  startMouseX: number
  startMouseY: number
  startW: number
  startH: number
  startPosX: number
  startPosY: number
}


// ---------------------------------------------------------------------------
// DraggableDialogContent
// ---------------------------------------------------------------------------

export interface DraggableDialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "style"> {
  defaultWidth?: number
  defaultHeight?: number
  minWidth?: number
  minHeight?: number
  /**
   * When set, size and position persist across opens under `oe-dialog-<storageKey>`.
   * Omit to keep the centred-at-default behaviour with no storage at all.
   */
  storageKey?: string
}

export const DraggableDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DraggableDialogContentProps
>(
  (
    {
      className,
      children,
      defaultWidth = 700,
      defaultHeight = 600,
      minWidth = 400,
      minHeight = 300,
      storageKey,
      onPointerDownOutside,
      ...props
    },
    ref
  ) => {
    // A react-resizable-panels `Separator` (e.g. Map Grid's cell-info column
    // resize handle) sitting inside this dialog's own content is still a real
    // DOM descendant, but Radix's outside-pointerdown detection wrongly treats
    // it as "outside" and closes the dialog on the very first click on it —
    // confirmed via a live repro (issue #127): react-resizable-panels
    // registers its own raw `document`-level pointerdown listener (capture
    // phase, for its drag logic) the moment a Group first mounts, and that
    // listener sits higher in the DOM (on `document` itself) than React's own
    // root container, so it runs before React's synthetic event dispatch ever
    // reaches Radix's DismissableLayer — meaning Radix's
    // `isPointerInsideReactTreeRef` (set via a React onPointerDownCapture
    // handler) is never marked true for this click, and Radix's own
    // "was this inside the layer" check comes back negative. Fixed the
    // supported way: Radix calls the caller's `onPointerDownOutside` first and
    // skips its own dismiss when that handler calls preventDefault().
    const handlePointerDownOutside = React.useCallback(
      (e: Parameters<NonNullable<typeof onPointerDownOutside>>[0]) => {
        const target = e.target as HTMLElement | null
        if (target?.closest('[role="separator"]')) {
          e.preventDefault()
        }
        // A Radix Select/DropdownMenu/Popover nested inside this dialog's
        // content (e.g. the Map Grid info column's player/portal-target
        // dropdowns) portals its open content to a `[data-radix-popper-
        // content-wrapper]` outside this dialog's own DOM subtree. Clicking
        // an item in it is consumed by the Select first and never reaches
        // here, but a pointerdown that just DISMISSES the open dropdown
        // (clicking elsewhere) was still reaching this dialog's own outside-
        // pointerdown check and closing the whole dialog underneath it —
        // same class of bug as the separator case above, same fix.
        if (target?.closest('[data-radix-popper-content-wrapper]')) {
          e.preventDefault()
        }
        onPointerDownOutside?.(e)
      },
      [onPointerDownOutside]
    )
    // Position and size are stored as plain numbers (px from viewport top-left).
    const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null)
    const [size, setSize] = React.useState({ width: defaultWidth, height: defaultHeight })

    // Restore a saved geometry, else centre at the defaults. Runs once per open,
    // since Radix unmounts the content when the dialog closes.
    const containerRef = React.useRef<HTMLDivElement | null>(null)
    React.useLayoutEffect(() => {
      if (pos !== null) return

      const saved = storageKey ? readDialogGeometry(storageKey, minWidth, minHeight) : null
      if (saved) {
        setSize({ width: saved.width, height: saved.height })
        setPos({ x: saved.x, y: saved.y })
        return
      }

      setPos({
        x: Math.max(0, window.innerWidth / 2 - defaultWidth / 2),
        y: Math.max(0, window.innerHeight / 2 - defaultHeight / 2),
      })
    }, [pos, defaultWidth, defaultHeight, minWidth, minHeight, storageKey])

    /** Persist the current box. Called at the end of a drag or resize, never
     *  during one — writing per pointer-move would hammer localStorage. */
    const persist = React.useCallback(() => {
      if (!storageKey) return
      setPos((curPos) => {
        setSize((curSize) => {
          if (curPos) writeDialogGeometry(storageKey, { ...curPos, ...curSize })
          return curSize
        })
        return curPos
      })
    }, [storageKey])

    // Drag state — stored in a ref so pointer-move handlers never stale-close.
    const dragRef = React.useRef<DragState | null>(null)
    const resizeRef = React.useRef<ResizeState | null>(null)

    // ---- Drag (header) ----------------------------------------------------

    const onDragPointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        // Don't initiate drag when the click lands on an interactive element
        // (buttons, inputs, links, etc.) inside the drag handle — those need
        // their own click/focus events to work normally. This also covers
        // Radix menu/listbox items: even though their content portals
        // elsewhere in the DOM, React bubbles synthetic events along the
        // component tree, so a menu nested in the drag handle's JSX still
        // reaches this handler — and setPointerCapture()'ing the drag handle
        // out from under it breaks the item's own click handling entirely.
        if ((e.target as HTMLElement).closest('button, input, a, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [data-nodrag]')) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setPos((cur) => {
          dragRef.current = {
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startPosX: cur?.x ?? 0,
            startPosY: cur?.y ?? 0,
          }
          return cur
        })
      },
      []
    )

    const onDragPointerMove = React.useCallback((e: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startMouseX
      const dy = e.clientY - dragRef.current.startMouseY
      setPos({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      })
    }, [])

    const onDragPointerUp = React.useCallback(() => {
      if (!dragRef.current) return
      dragRef.current = null
      persist()
    }, [persist])

    // ---- Resize (edge / corner handles) -----------------------------------

    const makeResizePointerDown = React.useCallback(
      (edge: ResizeEdge) => (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        setPos((curPos) => {
          setSize((curSize) => {
            resizeRef.current = {
              edge,
              startMouseX: e.clientX,
              startMouseY: e.clientY,
              startW: curSize.width,
              startH: curSize.height,
              startPosX: curPos?.x ?? 0,
              startPosY: curPos?.y ?? 0,
            }
            return curSize
          })
          return curPos
        })
      },
      []
    )

    const onResizePointerMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeRef.current) return
      const { edge, startMouseX, startMouseY, startW, startH, startPosX, startPosY } =
        resizeRef.current
      const dx = e.clientX - startMouseX
      const dy = e.clientY - startMouseY

      let newW = startW
      let newH = startH
      let newX = startPosX
      let newY = startPosY

      if (edge.includes("e")) newW = Math.max(minWidth, startW + dx)
      if (edge.includes("s")) newH = Math.max(minHeight, startH + dy)
      if (edge.includes("w")) {
        newW = Math.max(minWidth, startW - dx)
        newX = startPosX + (startW - newW)
      }
      if (edge.includes("n")) {
        newH = Math.max(minHeight, startH - dy)
        newY = startPosY + (startH - newH)
      }

      setSize({ width: newW, height: newH })
      setPos({ x: newX, y: newY })
    }, [minWidth, minHeight])

    const onResizePointerUp = React.useCallback(() => {
      if (!resizeRef.current) return
      resizeRef.current = null
      persist()
    }, [persist])

    // Don't render until we have a position (avoids flash in wrong place).
    if (pos === null) return null

    return (
      <DragHandleContext.Provider
        value={{
          onPointerDown: onDragPointerDown,
          onPointerMove: onDragPointerMove,
          onPointerUp: onDragPointerUp,
        }}
      >
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            ref={(node) => {
              // Forward both the external ref and our internal containerRef.
              containerRef.current = node
              if (typeof ref === "function") ref(node)
              else if (ref) ref.current = node
            }}
            style={{
              position: "fixed",
              left: pos.x,
              top: pos.y,
              width: size.width,
              height: size.height,
              // Radix sets transform: translate(-50%,-50%) via its own styles; override.
              transform: "none",
              maxWidth: "none",
              maxHeight: "none",
            }}
            className={cn(
              "z-50 flex flex-col border bg-background shadow-lg overflow-hidden",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "sm:rounded-lg",
              className
            )}
            onPointerDownOutside={handlePointerDownOutside}
            {...props}
          >
            {/* ---- Resize handles ---- */}

            {/* Edges */}
            <div
              className="absolute inset-x-3 top-0 h-[4px] cursor-n-resize z-20 select-none"
              onPointerDown={makeResizePointerDown("n")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
            <div
              className="absolute inset-x-3 bottom-0 h-[4px] cursor-s-resize z-20 select-none"
              onPointerDown={makeResizePointerDown("s")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
            <div
              className="absolute inset-y-3 left-0 w-[4px] cursor-w-resize z-20 select-none"
              onPointerDown={makeResizePointerDown("w")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
            <div
              className="absolute inset-y-3 right-0 w-[4px] cursor-e-resize z-20 select-none"
              onPointerDown={makeResizePointerDown("e")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />

            {/* Corners — slightly larger hit area, layered above edges */}
            <div
              className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize z-30 select-none"
              onPointerDown={makeResizePointerDown("nw")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
            <div
              className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize z-30 select-none"
              onPointerDown={makeResizePointerDown("ne")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
            <div
              className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-30 select-none"
              onPointerDown={makeResizePointerDown("sw")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-30 select-none"
              onPointerDown={makeResizePointerDown("se")}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
            />

            {/* ---- Close button (always on top) ---- */}
            <DialogPrimitive.Close className="absolute right-4 top-3.5 z-40 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>

            {children}
          </DialogPrimitive.Content>
        </DialogPortal>
      </DragHandleContext.Provider>
    )
  }
)
DraggableDialogContent.displayName = "DraggableDialogContent"

// ---------------------------------------------------------------------------
// DraggableDialogDragHandle
// Wrap the dialog's title bar with this to make it the drag handle.
// ---------------------------------------------------------------------------

export interface DraggableDialogDragHandleProps
  extends React.HTMLAttributes<HTMLDivElement> {}

export function DraggableDialogDragHandle({
  className,
  children,
  ...props
}: DraggableDialogDragHandleProps) {
  const ctx = React.useContext(DragHandleContext)
  // No context means this header is not inside a draggable dialog — it is being
  // rendered in an undocked panel window, where the OS moves the window. Showing a
  // move cursor there would promise behaviour that does not exist.
  return (
    <div
      {...props}
      className={cn("select-none", ctx && "cursor-move", className)}
      onPointerDown={ctx?.onPointerDown}
      onPointerMove={ctx?.onPointerMove}
      onPointerUp={ctx?.onPointerUp}
    >
      {children}
    </div>
  )
}
