// Read side of items: catalogue, search, single item. Writes come in later steps.
const express = require('express');
const { search } = require('../lib/search');

module.exports = function itemRoutes(store) {
  const router = express.Router();

  router.get('/api/catalogue.json', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ generatedAt: new Date().toISOString(), items: store.catalogue() });
  });

  router.get('/api/items', (req, res) => {
    const q = req.query.q || '';
    res.json(q ? search(store.catalogue(), q, 50) : store.catalogue().slice(0, 50));
  });

  router.get('/api/items/:id', (req, res) => {
    const item = store.items.get(String(req.params.id).toLowerCase());
    if (!item) return res.status(404).json({ error: 'no such item' });
    const openLoans = [...store.loans.values()].filter(l => l.itemId === item.id && !l.returnedAt);
    const contents = (item.contents || []).map(c => ({
      ...c, name: store.items.get(c.itemId)?.name || c.itemId,
    }));
    res.json({ ...item, contents, openLoans });
  });

  return router;
};
