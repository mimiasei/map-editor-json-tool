// ─── RMG deterministic RNG (issue #210, Milestone 3) ────────────────────────
// mulberry32 — a small, fast, well-known deterministic PRNG. Used when a
// template specifies a fixed numeric seed, so the exact same template
// reliably regenerates the exact same map (sharing a seed, or reproducing
// one specific generation for a bug report).

export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
