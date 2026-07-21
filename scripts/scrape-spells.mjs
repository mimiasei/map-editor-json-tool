/**
 * Scrapes spell data from https://oldenera.th.gl/db/spells
 * Outputs: src/data/spells.json
 *
 * Run with: node scripts/scrape-spells.mjs
 */

import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, '../src/data/spells.json')
const BASE_URL = 'https://oldenera.th.gl'
const CONCURRENCY = 8
const DELAY_MS = 100

// ─── School + rank from slug ──────────────────────────────────────────────────

function schoolFromSlug(slug) {
  if (slug.startsWith('day_'))    return 'Daylight'
  if (slug.startsWith('night_'))  return 'Nightshade'
  if (slug.startsWith('primal_')) return 'Primal'
  if (slug.startsWith('space_'))  return 'Arcane'
  return 'Neutral'
}

function rankFromSlug(slug) {
  // Slug format: <school>_<rank>_magic_<name> e.g. day_1_magic_healing_water
  const m = slug.match(/^[a-z]+_(\d+)_/)
  return m ? parseInt(m[1], 10) : undefined
}

// ─── Step 1: Fetch listing page and extract all sids + names ─────────────────

async function fetchListing() {
  console.log('Fetching spell listing...')
  const res = await fetch(`${BASE_URL}/db/spells`)
  const html = await res.text()

  const spells = []
  const seen = new Set()

  // Extract all /db/spells/<slug> hrefs — each is a spell sid
  const hrefRegex = /href="\/db\/spells\/([^"/]+)"/g
  let m
  while ((m = hrefRegex.exec(html)) !== null) {
    const sid = m[1]
    if (seen.has(sid)) continue
    seen.add(sid)
    spells.push({ sid })
  }

  // Match names from JSON-LD ItemList (may be truncated at 100)
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  const nameMap = new Map()
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1])
      if (ld.itemListElement) {
        for (const item of ld.itemListElement) {
          const slug = item.url?.split('/').pop()
          if (slug && item.name) nameMap.set(slug, item.name)
        }
      }
    } catch {}
  }

  // Apply names from JSON-LD where available
  for (const spell of spells) {
    if (nameMap.has(spell.sid)) spell.name = nameMap.get(spell.sid)
  }

  console.log(`Found ${spells.length} spells in listing (${nameMap.size} with names from JSON-LD).`)
  return spells
}

// ─── Step 2: Fetch a single detail page ───────────────────────────────────────

async function fetchDetail(sid) {
  const res = await fetch(`${BASE_URL}/db/spells/${sid}`)
  const html = await res.text()

  // Name from JSON-LD
  let name
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  if (ldMatch) {
    try {
      const ld = JSON.parse(ldMatch[1])
      name = ld.name
    } catch {}
  }

  // Description from <meta name="description">
  const metaMatch = html.match(/<meta name="description" content="([^"]*)"/)
  const description = metaMatch ? metaMatch[1].trim() : undefined

  return { name, description }
}

// ─── Step 3: Process in batches ───────────────────────────────────────────────

async function processBatch(batch, allSpells) {
  const results = await Promise.all(batch.map(({ sid }) => fetchDetail(sid)))
  for (let i = 0; i < batch.length; i++) {
    const entry = allSpells.find(s => s.sid === batch[i].sid)
    if (!entry) continue
    const detail = results[i]
    if (detail.name) entry.name = detail.name
    if (detail.description) entry.description = detail.description
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const spells = await fetchListing()

  // Enrich with school + rank from slug
  for (const spell of spells) {
    spell.school = schoolFromSlug(spell.sid)
    const rank = rankFromSlug(spell.sid)
    if (rank !== undefined) spell.rank = rank
  }

  console.log(`Fetching ${spells.length} detail pages (batch size ${CONCURRENCY})...`)

  let done = 0
  for (let i = 0; i < spells.length; i += CONCURRENCY) {
    const batch = spells.slice(i, i + CONCURRENCY)
    await processBatch(batch, spells)
    done += batch.length
    process.stdout.write(`\r  ${done}/${spells.length}`)
    if (i + CONCURRENCY < spells.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }
  console.log('\nDone.')

  // Sort by school then rank then name
  spells.sort((a, b) => {
    if (a.school !== b.school) return (a.school ?? '').localeCompare(b.school ?? '')
    if ((a.rank ?? 0) !== (b.rank ?? 0)) return (a.rank ?? 0) - (b.rank ?? 0)
    return (a.name ?? a.sid).localeCompare(b.name ?? b.sid)
  })

  writeFileSync(OUT_PATH, JSON.stringify(spells, null, 2))
  console.log(`Written ${spells.length} spells to ${OUT_PATH}`)

  console.log('\nSample (first 3):')
  spells.slice(0, 3).forEach(s => console.log(JSON.stringify(s)))
}

main().catch(console.error)
