'use strict';

/* HTTP check of the delete-game route + UI against a running server.
   Usage: BASE=http://localhost:3100 node scripts/check-delete-http.js */

const assert = require('node:assert');
const db = require('../db');
const game = require('../lib/game');

const BASE = process.env.BASE || 'http://localhost:3100';
const PW = process.env.ADMIN_PASSWORD || 'test123';

(async () => {
  // 1. Login -> capture cookie.
  const login = await fetch(`${BASE}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `password=${encodeURIComponent(PW)}`,
    redirect: 'manual',
  });
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  assert.ok(cookie.includes('wc_admin'), 'got admin cookie');

  // 2. Create a throwaway game directly.
  const gid = game.createGame('DELETE ME (http test)');

  // 3. UI renders the delete controls.
  const gamePage = await (await fetch(`${BASE}/admin/games/${gid}`, { headers: { cookie } })).text();
  assert.ok(gamePage.includes('Delete this game'), 'game page shows danger-zone delete button');
  assert.ok(gamePage.includes('confirm('), 'delete is guarded by a confirm() warning');

  const home = await (await fetch(`${BASE}/admin`, { headers: { cookie } })).text();
  assert.ok(home.includes('link-btn danger'), 'home list shows per-game delete button');

  // 4. POST delete -> 302 redirect to /admin.
  const del = await fetch(`${BASE}/admin/games/${gid}/delete`, {
    method: 'POST', headers: { cookie }, redirect: 'manual',
  });
  assert.strictEqual(del.status, 302, 'delete redirects');
  assert.ok((del.headers.get('location') || '').startsWith('/admin'), 'redirects to /admin');

  // 5. Game (and children) gone from DB.
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM games WHERE id=?').get(gid).c, 0, 'game deleted');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM teams WHERE game_id=?').get(gid).c, 0, 'teams cascade-deleted');

  // 6. Auth required: delete without cookie should NOT work (redirect to login).
  const gid2 = game.createGame('temp');
  const noauth = await fetch(`${BASE}/admin/games/${gid2}/delete`, { method: 'POST', redirect: 'manual' });
  assert.ok(noauth.status === 302 && (noauth.headers.get('location') || '').includes('/admin/login'), 'delete requires admin auth');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM games WHERE id=?').get(gid2).c, 1, 'unauthenticated delete blocked');
  game.deleteGame(gid2); // cleanup

  console.log('✓ delete route: UI buttons + confirm, cascade delete, auth-guarded — all pass');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
