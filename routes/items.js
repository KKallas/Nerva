// Read side of items: catalogue, search, single item. Writes come in later steps.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { search } = require('../lib/search');
const { unitId } = require('../lib/units');

module.exports = function itemRoutes(store) {
  const router = express.Router();

  router.get('/api/catalogue.json', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ generatedAt: new Date().toISOString(), config: store.config, items: store.catalogue() });
  });

  router.get('/api/items', (req, res) => {
    const q = req.query.q || '';
    res.json(q ? search(store.catalogue(), q, 50) : store.catalogue().slice(0, 50));
  });

  // Works for a product ("338va6") and for one of its units ("338va6-2").
  router.get('/api/items/:id', (req, res) => {
    const found = store.resolve(req.params.id);
    if (!found) return res.status(404).json({ error: 'no such item' });
    const { item, unit } = found;
    const id = unit ? unitId(item.id, unit.n) : item.id;
    const openLoans = [...store.loans.values()].filter(l => l.itemId === id && !l.returnedAt);
    const contents = (item.contents || []).map(c => ({
      ...c, name: store.items.get(c.itemId)?.name || c.itemId,
    }));
    // A unit page carries the product's details plus which one it is.
    res.json({ ...item, contents, openLoans, unit, unitId: unit ? id : null, productId: item.id });
  });

  // Delete. Refused while the item is out on loan or is part of a set:
  // both would leave a dangling reference someone has to puzzle out later.
  router.delete('/api/items/:id', (req, res) => {
    const id = String(req.params.id).toLowerCase();
    const item = store.items.get(id);
    if (!item) return res.status(404).json({ error: 'no such item' });
    const mine = new Set([id, ...(item.units || []).map(u => unitId(id, u.n))]);
    const open = [...store.loans.values()].filter(l => mine.has(l.itemId) && !l.returnedAt);
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
