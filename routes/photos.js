// Photos. The browser resizes and encodes JPEG, so the body is raw bytes and
// the server only writes the file. Two per item: the thing, and where it lives.
const fs = require('fs');
const path = require('path');
const express = require('express');

const KIND = { item: 'item', loc: 'loc' };

// Where a photo lives on disk.
//   <id>-item.jpg       the product, or the model of it
//   <id>-<n>-item.jpg   this actual numbered one
//   <id>-loc.jpg        where they are kept, shared by every unit
const photoName = (item, unit, type) =>
  type === 'item' ? (unit ? `${item.id}-${unit.n}-item.jpg` : `${item.id}-item.jpg`)
    : unit ? `${item.id}-${unit.n}-loc.jpg` : `${item.id}-loc.jpg`;

module.exports = function photoRoutes(store) {
  const router = express.Router();

  // A unit id ("338va6-2") photographs that one object. A location photo taken
  // on a unit belongs to the product while the unit lives wherever the product
  // does, which is the usual case; once a unit has a shelf of its own it gets a
  // picture of its own place too.
  function target(req, res) {
    const found = store.resolve(req.params.id);
    if (!found) { res.status(404).json({ error: 'no such item' }); return null; }
    const type = req.query.type;
    if (!KIND[type]) { res.status(400).json({ error: 'type must be item or loc' }); return null; }
    const unit = type === 'loc' && !(found.unit && found.unit.shelf) ? null : found.unit;
    return { item: found.item, unit, type, file: path.join(store.dirs.photos, photoName(found.item, unit, type)) };
  }

  const mark = (t, on) => {
    const owner = t.unit || t.item;
    const key = t.type === 'loc' ? 'locationPhoto' : 'photo';
    if (on) owner[key] = true; else delete owner[key];
    store.saveItem(t.item);
  };

  router.post('/api/items/:id/photo', express.raw({ type: 'image/jpeg', limit: '4mb' }), (req, res) => {
    const t = target(req, res); if (!t) return;
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'send a JPEG body' });
    fs.writeFileSync(t.file + '.tmp', req.body);
    fs.renameSync(t.file + '.tmp', t.file);
    mark(t, true);
    const id = t.unit ? `${t.item.id}-${t.unit.n}` : t.item.id;
    store.log({ type: 'photo', id, which: t.type, bytes: req.body.length, who: req.who || null });
    res.json({ ok: true, id, bytes: req.body.length });
  });

  router.delete('/api/items/:id/photo', (req, res) => {
    const t = target(req, res); if (!t) return;
    if (fs.existsSync(t.file)) fs.unlinkSync(t.file);
    mark(t, false);
    store.log({ type: 'photo-removed', id: t.unit ? `${t.item.id}-${t.unit.n}` : t.item.id, which: t.type, who: req.who || null });
    res.json({ ok: true });
  });

  // Locations and shelves have photos too: the same raw-JPEG upload, stored as
  // place-<id>.jpg so a shelf photo is just another file in data/photos.
  const placeFile = id => path.join(store.dirs.photos, `place-${id}.jpg`);

  function place(req, res) {
    const found = store.resolvePlace(req.params.id);
    if (!found) { res.status(404).json({ error: 'no such place' }); return null; }
    return found;
  }
  const markPhoto = (found, on) => {
    const target = found.shelf || found.location;
    if (on) target.photo = true; else delete target.photo;
    store.saveLocation(found.location);
  };

  router.post('/api/places/:id/photo', express.raw({ type: 'image/jpeg', limit: '4mb' }), (req, res) => {
    const found = place(req, res); if (!found) return;
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'send a JPEG body' });
    const id = String(req.params.id).toLowerCase();
    fs.writeFileSync(placeFile(id) + '.tmp', req.body);
    fs.renameSync(placeFile(id) + '.tmp', placeFile(id));
    markPhoto(found, true);
    store.log({ type: 'place-photo', id, bytes: req.body.length, who: req.who || null });
    res.json({ ok: true, id, bytes: req.body.length });
  });

  router.delete('/api/places/:id/photo', (req, res) => {
    const found = place(req, res); if (!found) return;
    const id = String(req.params.id).toLowerCase();
    if (fs.existsSync(placeFile(id))) fs.unlinkSync(placeFile(id));
    markPhoto(found, false);
    res.json({ ok: true });
  });

  return router;
};
