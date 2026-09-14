export const RESOURCE_POOL_WEIGHTS: { sid: string; weight: number }[] = [
    { sid: 'resource_wood', weight: 20 },
    { sid: 'resource_ore', weight: 20 },
    { sid: 'resource_gold', weight: 15 },
    { sid: 'resource_mercury', weight: 10 },
    { sid: 'resource_crystals', weight: 10 },
    { sid: 'resource_gemstones', weight: 10 },
    { sid: 'resource_dust', weight: 10 },
    { sid: 'chest', weight: 10 },
    { sid: 'camp_fire', weight: 10 },
]

export function sampleResource(enabled: string[], rng: () => number = Math.random): string {
    const pool = enabled.length > 0
        ? RESOURCE_POOL_WEIGHTS.filter((w) => enabled.includes(w.sid))
        : RESOURCE_POOL_WEIGHTS
    const totalWeight = pool.reduce((sum, w) => sum + w.weight, 0)
    let roll = rng() * totalWeight
    for (const { sid, weight } of pool) {
        if (roll < weight) return sid
        roll -= weight
    }
    return pool[pool.length - 1].sid
}