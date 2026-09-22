// Yields the main thread back to the browser (via a scheduled repaint) so a
// long synchronous computation that reports progress between stages via
// `await`ing this actually gets to paint that progress before the next
// stage's own blocking work begins — a plain `await Promise.resolve()`
// resolves in the same microtask queue flush and never lets a repaint
// through, which is why this needs `requestAnimationFrame`, not a bare
// resolved promise.
export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}
