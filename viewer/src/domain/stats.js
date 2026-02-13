// ============================================================
// SEEDED RANDOM & STATS GENERATOR
// ============================================================

let _seed = 42;

export function setSeed(val) {
    _seed = val;
}

export function seededRandom() {
    _seed = (_seed * 16807) % 2147483647;
    return (_seed - 1) / 2147483646;
}

export function randInt(min, max) {
    return Math.floor(seededRandom() * (max - min + 1)) + min;
}

export function generatePermitStats(factor) {
    const base = factor * randInt(800, 3500);
    const total = Math.max(200, Math.round(base));
    const approvalRate = 0.45 + seededRandom() * 0.45;
    const approved = Math.round(total * approvalRate);
    const pendingRate = 0.05 + seededRandom() * 0.2;
    const pending = Math.round(total * pendingRate);
    const denied = Math.max(0, total - approved - pending);
    const avgDays = randInt(12, 90);
    const colorGroup = randInt(0, 9);
    // Simulate scrape freshness: 0 days (fresh) to 45 days (old)
    const lastScrapedDays = randInt(0, 45);
    return { total, approved, pending, denied, avgDays, approvalRate, colorGroup, lastScrapedDays };
}
