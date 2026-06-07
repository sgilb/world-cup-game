'use strict';

/**
 * Generate the group-stage fixture list (round-robin, 6 matches per group of 4).
 *
 * We generate pairings deterministically rather than maintaining a static file:
 * the group-stage opponents are fixed by the draw, only kickoff dates/times are
 * approximate. Kickoff times drive (a) fixture ordering and (b) the poller's live
 * windows — they are best-effort within the real group-stage window
 * (11-27 Jun 2026) and can be corrected per-fixture later without affecting
 * scoring (results are matched to fixtures by team pairing).
 *
 * Knockout fixtures are NOT generated here (teams are unknown until the group
 * stage finishes). They can be added via manual entry / a future enhancement.
 *
 * @param {Array<{name:string, group:string}>} teams
 * @returns {Array<{stage, group_code, matchday, home_team, away_team, kickoff_utc}>}
 */
function generateGroupFixtures(teams) {
  // Bucket teams by group, preserving seed order within each group.
  const byGroup = new Map();
  for (const t of teams) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group).push(t.name);
  }

  // Round-robin pairings for a group of 4 (indices), split across 3 matchdays.
  const SCHEDULE = [
    { md: 1, pairs: [[0, 1], [2, 3]] },
    { md: 2, pairs: [[0, 2], [3, 1]] },
    { md: 3, pairs: [[3, 0], [1, 2]] },
  ];

  // Approximate group-stage window: matchdays roughly 6 days apart.
  const MD_START = { 1: '2026-06-11', 2: '2026-06-17', 3: '2026-06-23' };
  const KO_TIMES = ['16:00', '19:00', '22:00']; // UTC-ish slots

  const groupCodes = [...byGroup.keys()].sort();
  const fixtures = [];

  groupCodes.forEach((code, gIdx) => {
    const names = byGroup.get(code);
    if (names.length !== 4) {
      throw new Error(`Group ${code} must have 4 teams, found ${names.length}`);
    }
    for (const { md, pairs } of SCHEDULE) {
      // Spread groups across days: 2 groups per day within each matchday window.
      const dayOffset = Math.floor(gIdx / 2);
      const baseDate = new Date(`${MD_START[md]}T00:00:00Z`);
      baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
      pairs.forEach(([h, a], pairIdx) => {
        const time = KO_TIMES[(gIdx + pairIdx) % KO_TIMES.length];
        const dateStr = baseDate.toISOString().slice(0, 10);
        fixtures.push({
          stage: 'group',
          group_code: code,
          matchday: md,
          home_team: names[h],
          away_team: names[a],
          kickoff_utc: `${dateStr}T${time}:00Z`,
        });
      });
    }
  });

  return fixtures;
}

module.exports = { generateGroupFixtures };
