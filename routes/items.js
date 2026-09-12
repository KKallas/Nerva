// Read side of items: catalogue, search, single item. Writes come in later steps.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { search } = require('../lib/search');
const { unitId, placeOf } = require('../lib/units');

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
    // A unit page carries the product's details plus which one it is. Its own
    // photo is separate; the location photo is the product's, shared by all.
    const place = placeOf(item, unit);
    res.json({
      ...item, contents, openLoans, unit, unitId: unit ? id : null, productId: item.id,
      productPhoto: !!item.photo,
      previewId: store.previewId(item),
      photo: unit ? !!unit.photo : !!item.photo,
      // where this one lives, and whether that is its own or the product's
      shelf: place.shelf, location: place.location, placeOwn: place.own,
      productShelf: item.shelf || null, productLocation: item.location || '',
      locationPhoto: unit && place.own ? !!unit.locationPhoto : !!item.locationPhoto,
    });
  });

  // The few fields a person types. Everything else about an item is set by
  // doing something to it: counting, filing, photographing, numbering.
  const FIELDS = {
    name: v => String(v == null ? '' : v).trim().slice(0, 120),
    description: v => String(v == null ? '' : v).trim().slice(0, 500),
    tags: v => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\n]/))
      .map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 20),
  };

  router.post('/api/items', express.json(), (req, res) => {
    const body = req.body || {};
    const name = FIELDS.name(body.name);
    if (!name) return res.status(400).json({ error: 'a name is required' });
    const quantity = Math.max(0, Math.min(1e6, Math.round(Number(body.quantity)) || 0));
    const item = store.saveItem({
      id: store.newId(),
      kind: body.kind === 'set' ? 'set' : 'item',
      name,
      description: FIELDS.description(body.description),
      tags: FIELDS.tags(body.tags),
      quantity,
      location: '',
    });
    store.log({ type: 'new', id: item.id, name, quantity, who: req.who || null });
    res.json({ ok: true, item });
  });

  // Only the typed fields, so a stray key cannot wipe units, shelves or photos.
  router.put('/api/items/:id', express.json(), (req, res) => {
    const item = store.items.get(String(req.params.id).toLowerCase());
    if (!item) return res.status(404).json({ error: 'no such item' });
    const body = req.body || {};
    const patch = {};
    for (const [k, clean] of Object.entries(FIELDS)) if (body[k] !== undefined) patch[k] = clean(body[k]);
    if (patch.name === '') return res.status(400).json({ error: 'a name is required' });
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to change' });
    Object.assign(item, patch);
    store.saveItem(item);
    store.log({ type: 'edit', id: item.id, fields: Object.keys(patch), who: req.who || null });
    res.json({ ok: true, item });
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
    const files = ['item', 'loc'].map(t => `${id}-${t}.jpg`)
      .concat((item.units || []).flatMap(u => [`${id}-${u.n}-item.jpg`, `${id}-${u.n}-loc.jpg`]));
    for (const name of files) {
      const f = path.join(store.dirs.photos, name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    store.deleteItem(id);
    store.log({ type: 'delete', id, name: item.name, who: req.who || null });
    res.json({ ok: true });
  });

  return router;
};
