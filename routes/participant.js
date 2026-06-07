'use strict';

const express = require('express');
const router = express.Router();
const game = require('../lib/game');

router.get('/:token', (req, res, next) => {
  const state = game.getParticipantState(req.params.token);
  if (!state) return next();
  if (state.game.status !== 'active') {
    return res.render('participant-pending', { state });
  }
  res.render('participant', { state });
});

module.exports = router;
