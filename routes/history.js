// The log, read back three ways, and the overview built from the open loans.
// An item's and a place's history are open like the rest of the catalogue.
// A person's is theirs and the admin's; the overview names people who are
// late, so it is the admin's too.
const path = require('path');
const express = require('express');
const { requireAdmin } = require('../lib/who');
const { findByUsername, publicUser } = require('../lib/users');
const { forItem, forPlace, forUser, page } = require('../lib/history');
const { outstanding, daysLate, byDue } = require('../lib/loans');
const { overview } = require('../lib/overview');

module.exports = function historyRoutes(store) {
  const router = express.Router();
  const send = file => (req, res) => res.sendFile(path.join(__dirname, '..', 'public', file));

  router.get('/api/items/:id/history', (req, res) => {
    if (!store.resolve(req.params.id)) return res.status(404).json({ error: 'no such item' });
    res.json(page(store, forItem(store, req.params.id), req.query.limit));
  });

  router.get('/api/places/:id/history', (req, res) => {
    if (!store.resolvePlace(req.params.id)) return res.status(404).json({ error: 'no such place' });
    res.json(page(store, forPlace(store, req.params.id), req.query.limit));
  });

  // Yourself, or anyone for an admin. "me" saves the page knowing the username.
  function person(req, res) {
    if (!req.user) { res.status(401).json({ error: 'log in first', login: true }); return null; }
    const name = req.params.username === 'me' ? req.user.username : String(req.params.username).toLowerCase();
    if (name !== req.user.username && req.user.role !== 'admin') { res.status(403).json({ error: 'only an admin can look at someone else' }); return null; }
    // someone deleted still has a history: the log keeps their username
    return findByUsername(store, name) || { username: name, name, gone: true };
  }

  router.get('/api/people/:username', (req, res) => {
    const user = person(req, res); if (!user) return;
    const loans = [...store.loans.values()].filter(l => l.who === user.username).sort(byDue).map(l => {
      const found = store.resolve(l.itemId);
      return { ...l, name: found ? found.item.name + (found.unit ? ` #${found.unit.n}` : '') : l.itemId, outstanding: outstanding(l), daysLate: daysLate(l) };
    });
    res.json({ user: user.gone ? user : publicUser(user), open: loans.filter(l => !l.returnedAt),
      returned: loans.filter(l => l.returnedAt).sort((a, b) => b.returnedAt.localeCompare(a.returnedAt)).slice(0, 100) });
  });

  router.get('/api/people/:username/history', (req, res) => {
    const user = person(req, res); if (!user) return;
    res.json(page(store, forUser(store, user.username), req.query.limit));
  });

  router.get('/api/overview', requireAdmin, (req, res) => res.json(overview(store)));

  router.get('/u/:username', send('person.html'));
  router.get('/overview', send('overview.html'));
  return router;
};
