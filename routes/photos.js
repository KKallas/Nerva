// Photos. The browser resizes and encodes JPEG, so the body is raw bytes and
// the server only writes the file. Two per item: the thing, and where it lives.
const fs = require('fs');
const path = require('path');
const express = require('express');

const KIND = { item: 'item', loc: 'loc' };

module.exports = function photoRoutes(store) {
  const router = express.Router();
  const file = (id, type) => path.join(store.dirs.photos, `${id}-${KIND[type]}.jpg`);

  function target(req, res) {
    const item = store.items.get(String(req.params.id).toLowerCase());
    if (!item) { res.status(404).json({ error: 'no such item' }); return null; }
    if (!KIND[req.query.type]) { res.status(400).json({ error: 'type must be item or loc' }); return null; }
    return item;
  }

  router.post('/api/items/:id/photo', express.raw({ type: 'image/jpeg', limit: '4mb' }), (req, res) => {
    const item = target(req, res); if (!item) return;
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'send a JPEG body' });
    fs.writeFileSync(file(item.id, req.query.type) + '.tmp', req.body);
    fs.renameSync(file(item.id, req.query.type) + '.tmp', file(item.id, req.query.type));
    if (req.query.type === 'item') item.photo = true; else item.locationPhoto = true;
    store.saveItem(item);
    store.log({ type: 'photo', id: item.id, which: req.query.type, bytes: req.body.length, who: req.who || null });
    res.json({ ok: true, id: item.id, bytes: req.body.length });
  });

  router.delete('/api/items/:id/photo', (req, res) => {
    const item = target(req, res); if (!item) return;
    const f = file(item.id, req.query.type);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    if (req.query.type === 'item') delete item.photo; else delete item.locationPhoto;
    store.saveItem(item);
    store.log({ type: 'photo-removed', id: item.id, which: req.query.type, who: req.who || null });
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
