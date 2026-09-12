// Read side of items: catalogue, search, single item. Writes come in later steps.
const fs = require('fs');
const path = require('path');
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

  // Delete. Refused while the item is out on loan or is part of a set:
  // both would leave a dangling reference someone has to puzzle out later.
  router.delete('/api/items/:id', (req, res) => {
    const id = String(req.params.id).toLowerCase();
    const item = store.items.get(id);
    if (!item) return res.status(404).json({ error: 'no such item' });
    const open = [...store.loans.values()].filter(l => l.itemId === id && !l.returnedAt);
    if (open.length) return res.status(409).json({ error: `still out on ${open.length} open loan(s)` });
    const inSets = [...store.items.values()].filter(s => (s.contents || []).some(c => c.itemId === id));
    if (inSets.length) return res.status(409).json({ error: `part of ${inSets.map(s => s.name).join(', ')}` });
    for (const type of ['item', 'loc']) {
      const f = path.join(store.dirs.photos, `${id}-${type}.jpg`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    store.deleteItem(id);
    store.log({ type: 'delete', id, name: item.name, who: req.who || null });
    res.json({ ok: true });
  });

  return router;
};
