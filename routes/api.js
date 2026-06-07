'use strict';

const express = require('express');
const router = express.Router();
const game = require('../lib/game');

// JSON state for client-side polling on the participant page.
router.get('/game/:token/state', (req, res) => {
  const state = game.getParticipantState(req.params.token);
  if (!state) return res.status(404).json({ error: 'not found' });
  res.json({
    status: state.game.status,
    me: { id: state.me.id, name: state.me.name },
    myFixtures: state.myFixtures,
    table: state.table,
    fetchedAt: new Date().toISOString(),
  });
});

module.exports = router;
