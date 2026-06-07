'use strict';

/**
 * Distribute all teams among participants.
 *
 * Goals, in priority order:
 *   1. Every team assigned exactly once; per-participant counts as even as
 *      possible (differ by at most 1).
 *   2. Minimise same-group collisions: a participant should hold at most one
 *      team per group (so friends' teams rarely play each other). Guaranteed
 *      zero collisions whenever participants >= 4; when participants < 4,
 *      collisions are unavoidable and are spread as evenly as possible.
 *   3. Secondary fairness: spread tiers (multipliers) so no one hoards the
 *      high-multiplier teams.
 *
 * Greedy, capacity-balanced, group-by-group draft. For each team we pick the
 * best participant by a lexicographic key:
 *   [ teams already held in this group,        (avoid collisions)
 *     -(remaining capacity),                    (keep counts balanced)
 *     teams already held of this team's tier,   (spread multipliers)
 *     random jitter ]                           (fair tiebreak)
 *
 * @param {Array<{id:number}>} participants
 * @param {Array<{name:string, group:string, tier:'A'|'B'|'C'}>} teams
 * @param {() => number} [rng]  injectable RNG for deterministic tests (default Math.random)
 * @returns {{ assignments: Map<string, number>, capacities: Map<number, number>, collisions: number }}
 */
function distributeTeams(participants, teams, rng = Math.random) {
  const P = participants.length;
  if (P < 1) throw new Error('Need at least 1 participant');
  if (P > teams.length) {
    throw new Error(`Too many participants (${P}) for ${teams.length} teams`);
  }

  const ids = participants.map((p) => p.id);

  // 1. Target capacity: base each, with `extra` randomly-chosen participants getting +1.
  const base = Math.floor(teams.length / P);
  const extra = teams.length % P;
  const capacityOrder = shuffle(ids, rng);
  const target = new Map();
  capacityOrder.forEach((id, i) => target.set(id, base + (i < extra ? 1 : 0)));

  // Stable per-participant random jitter for deterministic tiebreaks this run.
  const jitter = new Map(ids.map((id) => [id, rng()]));

  // Running state.
  const assigned = new Map(ids.map((id) => [id, 0]));
  const groupCount = new Map(ids.map((id) => [id, new Map()])); // groupCode -> count
  const tierCount = new Map(ids.map((id) => [id, { A: 0, B: 0, C: 0 }]));
  const heldInGroup = (id, g) => groupCount.get(id).get(g) || 0;

  // Group the teams, then process groups in random order.
  const byGroup = new Map();
  for (const t of teams) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t);
  }
  const groupOrder = shuffle([...byGroup.keys()], rng);

  const assignments = new Map();
  let collisions = 0;

  for (const g of groupOrder) {
    for (const team of byGroup.get(g)) {
      const withCapacity = ids.filter((id) => assigned.get(id) < target.get(id));

      const key = (id) => [
        heldInGroup(id, g),
        -(target.get(id) - assigned.get(id)),
        tierCount.get(id)[team.tier],
        jitter.get(id),
      ];

      let chosen = withCapacity[0];
      let bestKey = key(chosen);
      for (const id of withCapacity.slice(1)) {
        const k = key(id);
        if (compareTuples(k, bestKey) < 0) {
          chosen = id;
          bestKey = k;
        }
      }

      if (heldInGroup(chosen, g) > 0) collisions++;
      assignments.set(team.name, chosen);
      assigned.set(chosen, assigned.get(chosen) + 1);
      groupCount.get(chosen).set(g, heldInGroup(chosen, g) + 1);
      tierCount.get(chosen)[team.tier] += 1;
    }
  }

  return { assignments, capacities: target, collisions };
}

function compareTuples(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { distributeTeams };
