import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { isTauri } from '@/lib/native-fs'

// Forward any stray console.* calls from third-party libs to the log file on desktop
if (isTauri()) {
  import('@tauri-apps/plugin-log').then(({ attachConsole }) => attachConsole())
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
