// User management, admin only: add people, print their cards, reset a
// forgotten password, replace a lost card.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const U = require('../lib/users');
const { requireAdmin } = require('../lib/who');

module.exports = function userRoutes(store) {
  const router = express.Router();
  // Same order as item labels: a live tunnel, then BASE_URL, then this request's host.
  const baseUrl = req => (store.runtime.publicUrl || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const byId = (req, res) => {
    const user = store.users.get(req.params.id);
    if (!user) res.status(404).json({ error: 'no such user' });
    return user;
  };

  router.get('/api/users', requireAdmin, (req, res) => {
    const users = [...store.users.values()].sort((a, b) => (b.builtin - a.builtin) || a.username.localeCompare(b.username));
    // the same link the card's QR holds, for the printed card and for sending to
    // someone whose device cannot read a QR
    res.json(users.map(u => ({ ...U.publicUser(u, true), loginUrl: `${baseUrl(req)}/login?card=${u.card}` })));
  });

  router.post('/api/users', requireAdmin, express.json(), (req, res) => {
    try {
      const user = U.makeUser(store, req.body || {});
      store.log({ type: 'user-new', user: user.username, role: user.role, who: req.who });
      res.json({ ok: true, user: U.publicUser(user, true) });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  // Name and role. The username stays: it is what the log remembers.
  router.put('/api/users/:id', requireAdmin, express.json(), (req, res) => {
    const user = byId(req, res); if (!user) return;
    const body = req.body || {};
    if (body.name !== undefined) user.name = String(body.name).trim().slice(0, 80) || user.username;
    if (body.role !== undefined) {
      if (user.builtin && body.role !== 'admin') return res.status(400).json({ error: 'the built-in admin stays an admin' });
      user.role = body.role === 'admin' ? 'admin' : 'user';
    }
    store.saveUser(user);
    store.log({ type: 'user-edit', user: user.username, role: user.role, who: req.who });
    res.json({ ok: true, user: U.publicUser(user, true) });
  });

  // Forgot the password: clear it and sign them out everywhere. Their card
  // then asks for a new one, exactly like the first time.
  router.post('/api/users/:id/reset', requireAdmin, (req, res) => {
    const user = byId(req, res); if (!user) return;
    user.password = null;
    user.session = (user.session || 1) + 1;
    store.saveUser(user);
    store.log({ type: 'user-reset', user: user.username, who: req.who });
    res.json({ ok: true, user: U.publicUser(user, true) });
  });

  // Lost card: a new code, so the printed one stops working.
  router.post('/api/users/:id/card', requireAdmin, (req, res) => {
    const user = byId(req, res); if (!user) return;
    user.card = crypto.randomUUID();
    store.saveUser(user);
    store.log({ type: 'user-card', user: user.username, who: req.who });
    res.json({ ok: true, user: U.publicUser(user, true) });
  });

  router.delete('/api/users/:id', requireAdmin, (req, res) => {
    const user = byId(req, res); if (!user) return;
    if (user.builtin) return res.status(400).json({ error: 'the built-in admin cannot be deleted' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'you cannot delete yourself' });
    store.deleteUser(user.id);
    store.log({ type: 'user-delete', user: user.username, who: req.who });
    res.json({ ok: true });
  });

  // The card's QR: a login link. Admin only, because it is half of a login.
  router.get('/api/users/:id/card.svg', requireAdmin, (req, res, next) => {
    const user = byId(req, res); if (!user) return;
    QRCode.toString(`${baseUrl(req)}/login?card=${user.card}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })
      .then(svg => res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg), next);
  });

  router.get('/users', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'users.html')));
  router.get('/cards', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'cards.html')));

  return router;
};
