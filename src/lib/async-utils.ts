// Yields the main thread back to the browser (via a scheduled repaint) so a
// long synchronous computation that reports progress between stages via
// `await`ing this actually gets to paint that progress before the next
// stage's own blocking work begins — a plain `await Promise.resolve()`
// resolves in the same microtask queue flush and never lets a repaint
// through, which is why this needs `requestAnimationFrame`, not a bare
// resolved promise.

let headless = false

/** Headless CLI runs (issue #258) sit behind a fullscreen game, and an
 *  occluded window can have `requestAnimationFrame` paused or throttled —
 *  which would stall generation at its first yield. A MessageChannel
 *  message still lets a macrotask (and so a progress repaint, when the
 *  window is visible) through, without depending on frame callbacks. */
export function setHeadlessYield(on: boolean): void {
  headless = on
}

/** Resolves after the browser has painted. A requestAnimationFrame callback runs BEFORE the frame's paint, so continuing straight from it put the
 *  next blocking stretch ahead of the paint and the status text, bar and spinner stayed a stage behind (or frozen) for the whole stretch. */
export function yieldToUI(): Promise<void> {
  if (headless) {
    return new Promise((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => { channel.port1.close(); resolve() }
      channel.port2.postMessage(null)
    })
  }
  // No animation frames in a Web Worker (or Node): nothing to paint, just let queued messages through.
  if (typeof requestAnimationFrame === 'undefined') return new Promise((resolve) => setTimeout(resolve, 0))
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
}
