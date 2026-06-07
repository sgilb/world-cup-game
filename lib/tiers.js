'use strict';

/**
 * Assign A/B/C tiers (and x1/x2/x3 multipliers) to teams by splitting them into
 * even thirds by FIFA ranking.
 *
 * Lower fifaRank number = better team. Top third => A (x1), middle => B (x2),
 * bottom third => C (x3). For counts not divisible by 3 the remainder goes to
 * the larger (weaker) tiers, so the strongest tier never has extra teams.
 *
 * @param {Array<{name:string, group:string, fifaRank:number}>} teams
 * @returns {Array<{name, group, fifaRank, tier:'A'|'B'|'C', multiplier:1|2|3}>}
 */
function assignTiers(teams) {
  const sorted = [...teams].sort((a, b) => a.fifaRank - b.fifaRank);
  const n = sorted.length;
  const base = Math.floor(n / 3);
  const remainder = n % 3; // 0, 1 or 2 extra -> add to B then C (never A)
  const sizeA = base;
  const sizeB = base + (remainder >= 1 ? 1 : 0);
  // sizeC = n - sizeA - sizeB (absorbs the rest)

  return sorted.map((team, i) => {
    let tier, multiplier;
    if (i < sizeA) {
      tier = 'A';
      multiplier = 1;
    } else if (i < sizeA + sizeB) {
      tier = 'B';
      multiplier = 2;
    } else {
      tier = 'C';
      multiplier = 3;
    }
    return { ...team, tier, multiplier };
  });
}

module.exports = { assignTiers };
