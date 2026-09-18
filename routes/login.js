// Logging in: a username or a scanned card, then a password. The first scan
// of a card sets the password instead of asking for it.
const path = require('path');
const express = require('express');
const U = require('../lib/users');
const { setSession, clearSession } = require('../lib/who');
const { tooMany, fail, forgive } = require('../lib/limit');

module.exports = function loginRoutes(store) {
  const router = express.Router();

  // What the login page shows after a card is scanned: whose it is, and
  // whether to ask for their password or have them choose one.
  router.get('/api/login/card/:card', (req, res) => {
    const user = U.findByCard(store, req.params.card);
    if (!user) return res.status(404).json({ error: 'this card is not valid any more: ask an admin for a new one' });
    res.json({ username: user.username, name: user.name, hasPassword: !!user.password });
  });

  router.post('/api/login', express.json(), (req, res) => {
    const body = req.body || {};
    const user = body.card ? U.findByCard(store, body.card) : U.findByUsername(store, body.username);
    const key = `${req.ip}|${String(body.card || body.username || '').trim().toLowerCase()}`;
    if (tooMany(key)) return res.status(429).json({ error: 'too many wrong passwords: wait ten minutes' });
    if (!user) { fail(key); return res.status(401).json({ error: body.card ? 'this card is not valid any more' : 'wrong username or password' }); }

    if (!user.password) {
      if (!body.card) return res.status(400).json({ error: 'no password yet: scan the card you were given to choose one', needsCard: true });
      const problem = U.passwordProblem(body.password);
      if (problem) return res.status(400).json({ error: problem });
      user.password = U.hashPassword(body.password);
      user.passwordSetAt = new Date().toISOString();
      store.log({ type: 'password-set', user: user.username, who: user.username });
    } else if (!U.checkPassword(user, body.password)) {
      fail(key);
      return res.status(401).json({ error: body.card ? 'wrong password' : 'wrong username or password' });
    }
    forgive(key);
    user.lastSeen = new Date().toISOString();
    store.saveUser(user);
    setSession(store, req, res, user);
    res.json({ ok: true, user: U.publicUser(user) });
  });

  router.post('/api/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

  // Every page asks this on load, so renewing the cookie here means you stay
  // logged in for as long as you keep using Nerva, not a year from login.
  router.get('/api/me', (req, res) => {
    if (req.viaCookie) setSession(store, req, res, req.user);
    res.set('Cache-Control', 'no-store');
    res.json({ user: U.publicUser(req.user) });
  });

  // Changing your own password ends your other sessions, and keeps this one.
  router.put('/api/me/password', express.json(), (req, res) => {
    const body = req.body || {};
    if (!U.checkPassword(req.user, body.current)) return res.status(401).json({ error: 'the current password is wrong' });
    const problem = U.passwordProblem(body.password);
    if (problem) return res.status(400).json({ error: problem });
    req.user.password = U.hashPassword(body.password);
    req.user.passwordSetAt = new Date().toISOString();
    req.user.session = (req.user.session || 1) + 1;
    store.saveUser(req.user);
    store.log({ type: 'password-change', user: req.user.username, who: req.who });
    setSession(store, req, res, req.user);
    res.json({ ok: true });
  });

  router.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login.html')));
  router.get('/account', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'account.html')));

  return router;
};
