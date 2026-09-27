// ─── M1.5 (issue #224): cheap H3→OE structural transfer check ──────────────
// Per the research plan: before investing in any H3-pretrained model,
// directly compare simple, format-agnostic structural ratios between the two
// corpora. This deliberately avoids inventing a zone-inference algorithm (an
// open, harder problem the plan explicitly defers) — these ratios don't need
// zones, just the M1a/M1b extraction outputs.
//
// Run: node scripts/compare-h3-oe-transfer.mjs
// (requires plans/training-data/{oe,h3}-corpus.json — run M1a/M1b's
// extraction scripts first if missing)

import { readFileSync } from 'node:fs'

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
  return { n, mean: +mean.toFixed(3), median: +median.toFixed(3), min: sorted[0], max: sorted[n - 1] }
}

function ratio(a, b) {
  return a.median === 0 ? null : +(b.median / a.median).toFixed(2)
}

const oe = JSON.parse(readFileSync('plans/training-data/oe-corpus.json', 'utf8')).filter((e) => !e.error)
const h3 = JSON.parse(readFileSync('plans/training-data/h3-corpus.json', 'utf8')).filter((e) => !e.error)

const oeTiles = oe.map((e) => e.sizeX * e.sizeZ)
const h3Tiles = h3.map((e) => e.sizeX * e.sizeZ * e.layers)

const metrics = {
  'tiles per player': {
    oe: oe.map((e, i) => oeTiles[i] / (e.players || 1)),
    h3: h3.map((e, i) => h3Tiles[i] / (e.players || 1)),
  },
  'objects per 1000 tiles (density)': {
    oe: oe.map((e, i) => (e.objectCount / oeTiles[i]) * 1000),
    h3: h3.map((e, i) => (e.objectCount / h3Tiles[i]) * 1000),
  },
  'water fraction': {
    oe: oe.map((e, i) => e.waterTileCount / oeTiles[i]),
    h3: h3.map((e, i) => e.waterTileCount / h3Tiles[i]),
  },
}

console.log(`OE corpus: n=${oe.length}   H3 corpus: n=${h3.length}\n`)
for (const [name, { oe: oeVals, h3: h3Vals }] of Object.entries(metrics)) {
  const oeStats = stats(oeVals)
  const h3Stats = stats(h3Vals)
  const r = ratio(oeStats, h3Stats)
  console.log(`${name}:`)
  console.log(`  OE  median=${oeStats.median}  mean=${oeStats.mean}  range=[${oeStats.min}, ${oeStats.max}]`)
  console.log(`  H3  median=${h3Stats.median}  mean=${h3Stats.mean}  range=[${h3Stats.min}, ${h3Stats.max}]`)
  console.log(`  H3/OE median ratio: ${r}  ${r !== null && r >= 0.5 && r <= 2 ? '(same order of magnitude)' : '(NOT close — differs by >2x)'}\n`)
}
