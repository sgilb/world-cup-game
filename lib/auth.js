'use strict';

const crypto = require('crypto');

const COOKIE = 'wc_admin';

function expectedToken() {
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  const pw = process.env.ADMIN_PASSWORD || '';
  return crypto.createHmac('sha256', secret).update(`admin:${pw}`).digest('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function checkPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  // constant-time compare
  const a = Buffer.from(String(password));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setAuthCookie(res) {
  res.cookie(COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE);
}

function isAuthed(req) {
  return parseCookies(req)[COOKIE] === expectedToken();
}

function requireAdmin(req, res, next) {
  if (isAuthed(req)) return next();
  return res.redirect('/admin/login');
}

module.exports = { checkPassword, setAuthCookie, clearAuthCookie, isAuthed, requireAdmin };
