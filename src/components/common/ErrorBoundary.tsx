// ─── Top-level error boundary ────────────────────────────────────────────────
// Without this, any uncaught render exception unmounts the entire React tree
// with no fallback, leaving a permanently blank window that (in the desktop
// build especially) looks and feels like a crash — the only recovery is
// force-quitting and relaunching. Added while investigating a report of
// exactly that symptom on a very large (256x256, ~17k placed objects) map;
// no reproducible logic/performance bug was found (parsing, extraction, and
// every Map Grid computation checked out fast even at that scale), which
// points at something environment-specific this can't catch — but every
// future unexpected exception, whatever the cause, now gets a recoverable
// screen instead of a blank one.

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '@/lib/logger'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError(`Unhandled render error: ${error.message}\n${info.componentStack ?? ''}`)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {error.message || 'An unexpected error occurred while rendering the editor.'}
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          Reloading keeps your file on disk untouched — nothing has been saved since the last explicit save.
        </p>
        <Button onClick={this.handleReload}>Reload</Button>
      </div>
    )
  }
}
