// Users: a username the admin hands out, a printed card, a password.
//
// The card is a QR of a login link carrying `card`, a random UUID. It says
// who you are, like a username you do not have to type; the password proves
// it. A new user has no password: the first scan of their card asks for one.
// Typing only a username cannot set a first password, so knowing someone's
// username is not enough to claim their account.
const crypto = require('crypto');

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const MIN_PASSWORD = 6;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}

function checkPassword(user, password) {
  if (!user || !user.password) return false;
  const [kind, salt, hash] = user.password.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64url');
  const got = crypto.scryptSync(String(password || ''), salt, want.length);
  return crypto.timingSafeEqual(want, got);
}

const passwordProblem = p => (String(p || '').length < MIN_PASSWORD ? `a password needs at least ${MIN_PASSWORD} characters` : null);

const cleanUsername = v => String(v == null ? '' : v).trim().toLowerCase();

function makeUser(store, { username, name, role }) {
  username = cleanUsername(username);
  if (!USERNAME_RE.test(username)) throw Object.assign(new Error('a username is 2-32 letters, digits, dots, dashes or underscores'), { status: 400 });
  if (findByUsername(store, username)) throw Object.assign(new Error(`"${username}" is taken`), { status: 409 });
  return store.saveUser({
    id: crypto.randomUUID(),
    username,
    name: String(name || '').trim().slice(0, 80) || username,
    role: role === 'admin' ? 'admin' : 'user',
    card: crypto.randomUUID(),
    password: null,
    session: 1,
    createdAt: new Date().toISOString(),
  });
}

const findByUsername = (store, username) => [...store.users.values()].find(u => u.username === cleanUsername(username)) || null;
const findByCard = (store, card) => [...store.users.values()].find(u => u.card === String(card || '').trim().toLowerCase()) || null;

// The built-in admin always exists, and is never deleted or demoted, so the
// lab can never lock itself out of user management.
function ensureAdmin(store) {
  const found = [...store.users.values()].find(u => u.builtin);
  if (found) return found;
  const admin = makeUser(store, { username: findByUsername(store, 'admin') ? 'nerva-admin' : 'admin', name: 'Admin', role: 'admin' });
  admin.builtin = true;
  return store.saveUser(admin);
}

// What the browser may see. Never the hash; the card only for admins.
function publicUser(u, withCard) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, name: u.name, role: u.role, builtin: !!u.builtin,
    hasPassword: !!u.password, createdAt: u.createdAt, lastSeen: u.lastSeen || null,
    ...(withCard ? { card: u.card } : {}),
  };
}

module.exports = { hashPassword, checkPassword, passwordProblem, makeUser, findByUsername, findByCard, ensureAdmin, publicUser, MIN_PASSWORD };
