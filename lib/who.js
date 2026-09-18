// Who is asking. A signed cookie from the login page, or HTTP Basic auth
// (`curl -u mari:password`) for scripts. Sets req.user (the record) and
// req.who (the username, which is what the log keeps).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findByUsername, checkPassword } = require('./users');
const { tooMany, fail, forgive } = require('./limit');

const COOKIE = 'nerva';
const YEAR = 365 * 24 * 3600;
const PLACEHOLDER = 'change-me-to-a-long-random-string';

// SESSION_SECRET from .env, or one made up once and kept in data/, so that a
// fresh checkout works and logins survive a restart.
function sessionSecret(store) {
  const env = process.env.SESSION_SECRET;
  if (env && env !== PLACEHOLDER) return env;
  const file = path.join(store.dir, 'session-secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64url'), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}

const sign = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

// "<user id>.<session>.<signature>". Bumping user.session (a password reset
// or change) ends every cookie issued before it.
function cookieFor(secret, user) {
  const value = `${user.id}.${user.session || 1}`;
  return `${value}.${sign(secret, value)}`;
}

function userFromCookie(store, secret, raw) {
  const [id, session, sig] = String(raw || '').split('.');
  if (!id || !session || !sig) return null;
  const want = Buffer.from(sign(secret, `${id}.${session}`));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const user = store.users.get(id);
  return user && String(user.session || 1) === session ? user : null;
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function identify(store) {
  const secret = sessionSecret(store);
  return (req, res, next) => {
    let user = userFromCookie(store, secret, readCookie(req, COOKIE));
    req.viaCookie = !!user;
    const basic = /^Basic (.+)$/i.exec(req.headers.authorization || '');
    if (!user && basic) {
      const text = Buffer.from(basic[1], 'base64').toString('utf8');
      const i = text.indexOf(':');
      const key = `${req.ip}|${text.slice(0, i).trim().toLowerCase()}`;
      const candidate = i > 0 && !tooMany(key) && findByUsername(store, text.slice(0, i));
      if (candidate && checkPassword(candidate, text.slice(i + 1))) { user = candidate; forgive(key); }
      else if (candidate) fail(key);
    }
    req.user = user || null;
    req.who = user ? user.username : null;
    next();
  };
}

function setSession(store, req, res, user) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(cookieFor(sessionSecret(store), user))}; Path=/; Max-Age=${YEAR}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}
const clearSession = res => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);

// Looking things up needs nobody. Changing anything needs a name to put in
// the log. Mounted on /api, so paths here are relative to it.
function guardWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.user) return next();
  if (req.path === '/login' || req.path === '/logout') return next();
  if (req.path === '/file' && req.query.verb === 'find') return next();
  res.status(401).json({ error: 'log in first', login: true });
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'log in first', login: true });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'only an admin can do that' });
  next();
}

module.exports = { identify, guardWrites, requireAdmin, setSession, clearSession, cookieFor, userFromCookie, sessionSecret };
