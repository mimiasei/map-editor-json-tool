import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { isTauri } from '@/lib/native-fs'
import HeadlessGenerate from './components/headless/HeadlessGenerate.tsx'

// Forward any stray console.* calls from third-party libs to the log file on desktop
if (isTauri()) {
  import('@tauri-apps/plugin-log').then(({ attachConsole }) => attachConsole())
}

// CLI mode (issue #258): the GME mod launches TSE with --generate; render a
// minimal headless generator instead of the full app. Any failure reading the
// CLI matches (e.g. web build) falls through to the normal app.
async function readHeadlessArgs(): Promise<Record<string, string | undefined> | null> {
  if (!isTauri()) return null
  try {
    const { getMatches } = await import('@tauri-apps/plugin-cli')
    const { args } = await getMatches()
    if (!args.generate?.occurrences) return null
    const out: Record<string, string | undefined> = {}
    for (const [key, arg] of Object.entries(args)) {
      if (typeof arg.value === 'string') out[key] = arg.value
    }
    return out
  } catch {
    return null
  }
}

readHeadlessArgs().then((headlessArgs) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      {headlessArgs ? <HeadlessGenerate args={headlessArgs} /> : <App />}
    </React.StrictMode>,
  )
})
