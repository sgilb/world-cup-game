'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');

const db = require('./db');
const { startPoller } = require('./lib/poller');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.locals.appName = 'World Cup 2026 Sweepstakes';
app.locals.flag = require('./lib/flags').flagImg; // usage in views: <%- flag(teamName) %>

// Routes
app.get('/', (req, res) => res.redirect('/admin'));
app.use('/admin', require('./routes/admin'));
app.use('/p', require('./routes/participant'));
app.use('/api', require('./routes/api'));

// 404
app.use((req, res) => res.status(404).render('error', { message: 'Not found' }));

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`World Cup sweepstakes running on http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: ADMIN_PASSWORD not set — admin login will reject all passwords. Copy .env.example to .env.');
  }
  startPoller(db);
});

module.exports = app;
