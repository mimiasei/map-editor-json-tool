/**
 * Scrapes artifact data from https://oldenera.th.gl/db/artifacts
 * Outputs: src/data/artifacts.json
 *
 * Run with: node scripts/scrape-artifacts.mjs
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '../src/data/artifacts.json')
const BASE_URL = 'https://oldenera.th.gl'
const CONCURRENCY = 8
const DELAY_MS = 100

// ─── Step 1: Fetch listing page and extract all sids + names + slots ──────────

async function fetchListing() {
  console.log('Fetching artifact listing...')
  const res = await fetch(`${BASE_URL}/db/artifacts`)
  const html = await res.text()

  // The sidebar nav data is embedded in self.__next_f.push([1, "..."])
  // Extract all JSON-like strings from those push calls
  const artifacts = []
  const seen = new Set()

  // Find all __next_f push calls
  const pushRegex = /self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs
  let match
  while ((match = pushRegex.exec(html)) !== null) {
    const raw = match[1]
    // Unescape the JSON string content
    let decoded
    try {
      decoded = JSON.parse(`"${raw}"`)
    } catch {
      continue
    }

    // Look for item objects with sid/id + name + slot pattern
    // Items appear as {"id":"...artifact","name":"...","icon":{...}}
    const itemRegex = /"id"\s*:\s*"([^"]+_artifact[^"]*)"\s*,\s*"name"\s*:\s*"([^"]+)"/g
    let m
    while ((m = itemRegex.exec(decoded)) !== null) {
      const sid = m[1]
      const name = m[2]
      if (!seen.has(sid)) {
        seen.add(sid)
        artifacts.push({ sid, name })
      }
    }
  }

  // Also try extracting slot from groups structure
  // Groups look like: "label":"Armor","items":[{"id":"...","name":"..."}]
  const groupRegex = /"label"\s*:\s*"([^"]+)"\s*,\s*"items"\s*:\s*\[([^\]]*)\]/gs
  const allPushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)]
  for (const pm of allPushes) {
    let decoded
    try {
      decoded = JSON.parse(`"${pm[1]}"`)
    } catch {
      continue
    }
    let gm
    while ((gm = groupRegex.exec(decoded)) !== null) {
      const slot = gm[1]
      // Find all ids in this group's items array
      const idRegex = /"id"\s*:\s*"([^"]+)"/g
      let im
      while ((im = idRegex.exec(gm[2])) !== null) {
        const sid = im[1]
        const entry = artifacts.find(a => a.sid === sid)
        if (entry && !entry.slot) entry.slot = slot
      }
    }
  }

  console.log(`Found ${artifacts.length} artifacts in listing.`)
  return artifacts
}

// ─── Step 2: Fetch a single detail page ───────────────────────────────────────

async function fetchDetail(sid) {
  const res = await fetch(`${BASE_URL}/db/artifacts/${sid}`)
  const html = await res.text()

  // Name + description (template) from JSON-LD
  let name, description, rarity, slot
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1])
      name = ld.name
      description = ld.description
    } catch {}
  }

  // Resolved description from <meta name="description">
  const metaMatch = html.match(/<meta name="description" content="([^"]*)"/)
  if (metaMatch) description = metaMatch[1]

  // Rarity — amber-colored span after h1
  const rarityMatch = html.match(/text-amber-[^"]*"[^>]*>([^<]+)<\/span>/)
  if (rarityMatch) rarity = rarityMatch[1].trim()

  // Slot — slate/bg-slate span
  const slotMatch = html.match(/bg-slate-[^"]*"[^>]*>([^<]+)<\/span>/)
  if (slotMatch) slot = slotMatch[1].trim()

  return { name, description, rarity, slot }
}

// ─── Step 3: Process in batches ───────────────────────────────────────────────

async function processBatch(sids, allArtifacts) {
  const results = await Promise.all(sids.map(sid => fetchDetail(sid)))
  for (let i = 0; i < sids.length; i++) {
    const sid = sids[i]
    const entry = allArtifacts.find(a => a.sid === sid)
    if (entry) {
      const detail = results[i]
      if (detail.name) entry.name = detail.name
      if (detail.description) entry.description = detail.description
      if (detail.rarity) entry.rarity = detail.rarity
      if (detail.slot && !entry.slot) entry.slot = detail.slot
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const artifacts = await fetchListing()

  const sids = artifacts.map(a => a.sid)
  console.log(`Fetching ${sids.length} detail pages (batch size ${CONCURRENCY})...`)

  let done = 0
  for (let i = 0; i < sids.length; i += CONCURRENCY) {
    const batch = sids.slice(i, i + CONCURRENCY)
    await processBatch(batch, artifacts)
    done += batch.length
    process.stdout.write(`\r  ${done}/${sids.length}`)
    if (i + CONCURRENCY < sids.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }
  console.log('\nDone.')

  // Sort by name
  artifacts.sort((a, b) => (a.name ?? a.sid).localeCompare(b.name ?? b.sid))

  writeFileSync(OUT_PATH, JSON.stringify(artifacts, null, 2))
  console.log(`Written ${artifacts.length} artifacts to ${OUT_PATH}`)
  
  // Print a sample
  console.log('\nSample (first 3):')
  artifacts.slice(0, 3).forEach(a => console.log(JSON.stringify(a, null, 2)))
}

main().catch(console.error)
