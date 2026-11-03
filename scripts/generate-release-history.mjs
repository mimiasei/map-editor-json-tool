// Writes src/data/release-history.json: the `notes` of every published release's latest.json that has any, newest first.
// What's new shows it under the running release's own notes. Run it when cutting a release (npm run release-history); needs network.
// Set GITHUB_TOKEN to lift the anonymous API rate limit (60 requests/hour); the run makes one request per release page plus one per latest.json.

import { writeFileSync } from 'node:fs'

const REPO = 'mimiasei/map-editor-json-tool'
const OUT = new URL('../src/data/release-history.json', import.meta.url)
const headers = { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) }

async function getJson(url) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const releases = []
for (let page = 1; ; page++) {
  const batch = await getJson(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`)
  releases.push(...batch)
  if (batch.length < 100) break
}

const history = []
for (const release of releases) {
  if (release.draft) continue
  const asset = release.assets.find((a) => a.name === 'latest.json')
  if (!asset) continue
  const notes = String((await getJson(asset.browser_download_url)).notes ?? '')
    // The first line is meant for the GitHub release page and means nothing inside the app (same cut as WhatsNewDialog).
    .replace(/^Desktop release for[^\n]*\n+/, '')
    .trim()
  if (notes) history.push({ version: release.tag_name.replace(/^v/, ''), notes })
}

writeFileSync(OUT, JSON.stringify(history, null, 2) + '\n')
console.log(`${history.length} of ${releases.length} releases have notes -> src/data/release-history.json`)
