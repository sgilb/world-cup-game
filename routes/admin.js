'use strict';

const express = require('express');
const router = express.Router();

const db = require('../db');
const game = require('../lib/game');
const { pollOnce } = require('../lib/poller');
const { checkPassword, setAuthCookie, clearAuthCookie, isAuthed, requireAdmin } = require('../lib/auth');

// --- Auth ---
router.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/admin');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  if (checkPassword(req.body.password)) {
    setAuthCookie(res);
    return res.redirect('/admin');
  }
  res.status(401).render('login', { error: 'Incorrect password.' });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.redirect('/admin/login');
});

// Everything below requires admin auth.
router.use(requireAdmin);

// Dashboard: list games.
router.get('/', (req, res) => {
  res.render('admin-home', { games: game.listGames() });
});

// Create a game.
router.post('/games', (req, res) => {
  const name = (req.body.name || '').trim() || 'World Cup Sweepstakes';
  const id = game.createGame(name);
  res.redirect(`/admin/games/${id}`);
});

// Game dashboard (setup or active).
router.get('/games/:id', (req, res, next) => {
  const state = game.getAdminState(Number(req.params.id));
  if (!state) return next();
  const base = `${req.protocol}://${req.get('host')}`;
  res.render('admin-game', { ...state, base, flash: req.query.flash || null });
});

// Participants.
router.post('/games/:id/participants', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body.name || '').trim();
  if (name) game.addParticipant(id, name);
  res.redirect(`/admin/games/${id}`);
});

router.post('/games/:id/participants/:pid/delete', (req, res) => {
  game.removeParticipant(Number(req.params.id), Number(req.params.pid));
  res.redirect(`/admin/games/${req.params.id}`);
});

// Confirm participants -> distribute + activate (then overlay real kickoff times).
router.post('/games/:id/confirm', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const result = game.confirmGame(id);
    let flash = `Teams distributed: ${result.collisions} same-group collision(s).`;
    try {
      const sync = await game.syncSchedule(id);
      if (sync.groupSynced) flash += ` Synced real kickoff times for ${sync.groupSynced} group fixtures.`;
    } catch (e) {
      flash += ` (Couldn't sync kickoff times: ${e.message} — using approximate dates.)`;
    }
    res.redirect(`/admin/games/${id}?flash=${encodeURIComponent(flash)}`);
  } catch (err) {
    next(err);
  }
});

// Re-sync real fixture kickoff times / matchdays from the provider.
router.post('/games/:id/sync-schedule', async (req, res, next) => {
  try {
    const sync = await game.syncSchedule(Number(req.params.id));
    const parts = [];
    if (sync.groupSynced) parts.push(`${sync.groupSynced} group fixtures updated`);
    if (sync.knockoutAdded) parts.push(`${sync.knockoutAdded} knockout fixtures added`);
    if (sync.knockoutUpdated) parts.push(`${sync.knockoutUpdated} knockout fixtures updated`);
    if (sync.pending) parts.push(`${sync.pending} knockout slots awaiting teams`);
    let flash = parts.length ? `Schedule synced: ${parts.join(', ')}.` : `Nothing to sync (${sync.reason || 'no changes'}).`;
    if (sync.unmatched && sync.unmatched.length) {
      flash += ` Unmatched: ${sync.unmatched.slice(0, 5).join('; ')}${sync.unmatched.length > 5 ? '…' : ''}`;
    }
    res.redirect(`/admin/games/${req.params.id}?flash=${encodeURIComponent(flash)}`);
  } catch (err) {
    next(err);
  }
});

// Manual score entry.
router.post('/games/:id/fixtures/:fid/score', (req, res, next) => {
  try {
    const hg = parseInt(req.body.home_goals, 10);
    const ag = parseInt(req.body.away_goals, 10);
    if (Number.isNaN(hg) || Number.isNaN(ag)) throw new Error('Enter both scores');
    const winner = req.body.winner || null; // optional override for ET/pens on a draw
    game.setManualScore(Number(req.params.id), Number(req.params.fid), hg, ag, winner);
    res.redirect(`/admin/games/${req.params.id}#fixtures`);
  } catch (err) {
    next(err);
  }
});

router.post('/games/:id/fixtures/:fid/clear', (req, res) => {
  game.clearScore(Number(req.params.id), Number(req.params.fid));
  res.redirect(`/admin/games/${req.params.id}#fixtures`);
});

// Manual "poll now".
router.post('/games/:id/poll', async (req, res, next) => {
  try {
    const result = await pollOnce(db, { force: true });
    const flash = result.polled
      ? `Polled API: updated ${result.updated} fixtures (${result.liveCount} live).`
      : `Did not poll: ${result.reason}.`;
    res.redirect(`/admin/games/${req.params.id}?flash=${encodeURIComponent(flash)}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
