// Switching a product between "just a quantity" and "each one numbered", and
// adding or retiring the numbered ones.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { unitId, quantityOf } = require('../lib/units');

// Numbering is for things lent out one at a time: scopes, power supplies,
// soldering sets. Past a few dozen you want a quantity, not a label per screw.
const MAX_UNITS = 50;

module.exports = function unitRoutes(store) {
  const router = express.Router();
  const json = express.json();

  const product = (req, res) => {
    const item = store.items.get(String(req.params.id).toLowerCase());
    if (!item) { res.status(404).json({ error: 'no such item' }); return null; }
    return item;
  };
  const loansOn = id => [...store.loans.values()].filter(l => l.itemId === id && !l.returnedAt);

  // Turn a quantity into numbered units, or numbered units back into a quantity.
  router.put('/api/items/:id/tracked', json, (req, res) => {
    const item = product(req, res); if (!item) return;
    const tracked = !!(req.body && req.body.tracked);
    if (tracked === !!item.tracked) return res.json({ ok: true, item });

    if (tracked) {
      const n = item.quantity ?? 0;
      if (n < 1) return res.status(400).json({ error: 'nothing to number: the quantity is zero' });
      if (n > MAX_UNITS) return res.status(400).json({ error: `${n} is too many to number one by one (limit ${MAX_UNITS}). Things in this quantity are counted, not labelled individually.` });
      item.tracked = true;
      item.units = Array.from({ length: n }, (_, i) => ({ n: i + 1 }));
      item.nextUnit = n + 1;
    } else {
      const out = (item.units || []).filter(u => loansOn(unitId(item.id, u.n)).length);
      if (out.length) return res.status(409).json({ error: `units ${out.map(u => '#' + u.n).join(', ')} are out on loan` });
      item.quantity = quantityOf(item);
      for (const u of item.units || []) {                       // their own photos go too
        const f = path.join(store.dirs.photos, `${item.id}-${u.n}-item.jpg`);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      delete item.tracked;
      delete item.units;
    }
    store.saveItem(item);
    store.log({ type: 'tracked', id: item.id, tracked, who: req.who || null });
    res.json({ ok: true, item });
  });

  // Add one or more. Numbers continue upward and are never reused, so an old
  // label can never come to mean a different object.
  router.post('/api/items/:id/units', json, (req, res) => {
    const item = product(req, res); if (!item) return;
    if (!item.tracked) return res.status(400).json({ error: 'this item is a plain quantity' });
    const count = Math.max(1, Math.min(50, Math.round(Number(req.body && req.body.count) || 1)));
    if ((item.units || []).length + count > MAX_UNITS) return res.status(400).json({ error: `limit is ${MAX_UNITS} units` });
    let next = item.nextUnit || (item.units || []).reduce((m, u) => Math.max(m, u.n), 0) + 1;
    const added = [];
    for (let i = 0; i < count; i++) { added.push({ n: next }); next++; }
    item.units = [...(item.units || []), ...added];
    item.nextUnit = next;
    store.saveItem(item);
    store.log({ type: 'units-added', id: item.id, units: added.map(u => u.n), who: req.who || null });
    res.json({ ok: true, added: added.map(u => unitId(item.id, u.n)), item });
  });

  // Retire one. Refused while it is out, so nobody loses track of what they hold.
  router.delete('/api/items/:id/units/:n', (req, res) => {
    const item = product(req, res); if (!item) return;
    const n = Number(req.params.n);
    if (!(item.units || []).some(u => u.n === n)) return res.status(404).json({ error: `no unit #${n}` });
    if (loansOn(unitId(item.id, n)).length) return res.status(409).json({ error: `#${n} is out on loan` });
    item.units = item.units.filter(u => u.n !== n);
    const photo = path.join(store.dirs.photos, `${item.id}-${n}-item.jpg`);
    if (fs.existsSync(photo)) fs.unlinkSync(photo);
    store.saveItem(item);
    store.log({ type: 'unit-removed', id: item.id, unit: n, who: req.who || null });
    res.json({ ok: true, item });
  });

  return router;
};
