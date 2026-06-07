'use strict';

/**
 * Scoring rules:
 *   win = 3, draw = 1, loss = 0 (base points), multiplied by the team's tier
 *   multiplier (A x1, B x2, C x3). ET/penalty wins count as wins: that is
 *   encoded in fixture.winner, which we trust ('home' | 'away' | 'draw').
 */

/**
 * Resolve the winner of a finished match. The winner always follows the goals
 * for a decisive score; `override` ('home'|'away') is only honoured to break a
 * LEVEL score (extra-time / penalty winner) and can never contradict the goals.
 * @returns {'home'|'away'|'draw'}
 */
function resolveWinner(homeGoals, awayGoals, override) {
  if (homeGoals > awayGoals) return 'home';
  if (awayGoals > homeGoals) return 'away';
  return (override === 'home' || override === 'away') ? override : 'draw';
}

/** Base points (pre-multiplier) for each side of a finished fixture. */
function basePointsFor(winner) {
  switch (winner) {
    case 'home': return { home: 3, away: 0 };
    case 'away': return { home: 0, away: 3 };
    case 'draw': return { home: 1, away: 1 };
    default: return { home: 0, away: 0 };
  }
}

/**
 * Points a given team earns from one finished fixture (already multiplied).
 * Returns null if the team isn't in the fixture or it isn't finished.
 */
function pointsForTeam(fixture, teamName, multiplier) {
  if (fixture.status !== 'finished' || !fixture.winner) return null;
  const base = basePointsFor(fixture.winner);
  if (fixture.home_team === teamName) return base.home * multiplier;
  if (fixture.away_team === teamName) return base.away * multiplier;
  return null;
}

/**
 * Build the participant league table.
 *
 * @param {Array<{id, name}>} participants
 * @param {Array<{name, participant_id, multiplier}>} teams
 * @param {Array<fixture>} fixtures
 * @returns {Array<row>} sorted: points desc, wins desc, goalDiff desc, name asc
 */
function buildTable(participants, teams, fixtures) {
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const rows = new Map(
    participants.map((p) => [p.id, {
      participantId: p.id, name: p.name,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
    }])
  );

  for (const fx of fixtures) {
    if (fx.status !== 'finished' || !fx.winner) continue;
    const base = basePointsFor(fx.winner);

    for (const side of ['home', 'away']) {
      const teamName = side === 'home' ? fx.home_team : fx.away_team;
      const team = teamByName.get(teamName);
      if (!team || team.participant_id == null) continue;
      const row = rows.get(team.participant_id);
      if (!row) continue;

      const gf = side === 'home' ? fx.home_goals : fx.away_goals;
      const ga = side === 'home' ? fx.away_goals : fx.home_goals;
      const basePts = base[side];

      row.played += 1;
      row.goalsFor += gf ?? 0;
      row.goalsAgainst += ga ?? 0;
      row.points += basePts * team.multiplier;
      if (basePts === 3) row.won += 1;
      else if (basePts === 1) row.drawn += 1;
      else row.lost += 1;
    }
  }

  const table = [...rows.values()];
  for (const r of table) r.goalDiff = r.goalsFor - r.goalsAgainst;
  table.sort((a, b) =>
    b.points - a.points ||
    b.won - a.won ||
    b.goalDiff - a.goalDiff ||
    a.name.localeCompare(b.name)
  );
  table.forEach((r, i) => { r.position = i + 1; });
  return table;
}

module.exports = { resolveWinner, basePointsFor, pointsForTeam, buildTable };
