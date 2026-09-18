// Locations and their shelves. A location is a cabinet or a bench; a shelf is
// a drawer or a level inside it. Both have a photo and a QR code.
const path = require('path');
const express = require('express');
const { shelfId, placeName } = require('../lib/places');
const { quantityOf, placeOf } = require('../lib/units');

const name = v => String(v == null ? '' : v).trim().slice(0, 60);

module.exports = function locationRoutes(store) {
  const router = express.Router();
  const json = express.json();

  const view = loc => ({
    ...loc,
    items: store.entriesAt(loc.id).length,
    shelves: (loc.shelves || []).map(s => ({ ...s, id: shelfId(loc.id, s.n), items: store.entriesAt(shelfId(loc.id, s.n)).length })),
  });

  router.get('/api/locations', (req, res) => {
    res.json([...store.locations.values()].sort((a, b) => a.name.localeCompare(b.name)).map(view));
  });

  router.post('/api/locations', json, (req, res) => {
    const n = name(req.body && req.body.name);
    if (!n) return res.status(400).json({ error: 'a name is required' });
    const loc = store.saveLocation({ id: store.newId(), name: n, shelves: [], nextShelf: 1 });
    store.log({ type: 'location-new', id: loc.id, name: n, who: req.who || null });
    res.json({ ok: true, location: view(loc) });
  });

  const find = (req, res) => {
    const loc = store.locations.get(String(req.params.id).toLowerCase());
    if (!loc) { res.status(404).json({ error: 'no such location' }); return null; }
    return loc;
  };

  router.put('/api/locations/:id', json, (req, res) => {
    const loc = find(req, res); if (!loc) return;
    const n = name(req.body && req.body.name);
    if (!n) return res.status(400).json({ error: 'a name is required' });
    loc.name = n;
    store.saveLocation(loc);
    const touched = store.syncPlaceText(loc.id);     // items carry the text, so keep it true
    store.log({ type: 'location-renamed', id: loc.id, name: n, items: touched, who: req.who || null });
    res.json({ ok: true, location: view(loc) });
  });

  router.delete('/api/locations/:id', (req, res) => {
    const loc = find(req, res); if (!loc) return;
    const n = store.entriesAt(loc.id).length;
    if (n) return res.status(409).json({ error: `${n} item(s) are filed here; move them first` });
    store.deleteLocation(loc.id);
    store.log({ type: 'location-deleted', id: loc.id, name: loc.name, who: req.who || null });
    res.json({ ok: true });
  });

  // Shelf numbers, like unit numbers, are never reused: a label on a drawer
  // must not start meaning a different drawer.
  router.post('/api/locations/:id/shelves', json, (req, res) => {
    const loc = find(req, res); if (!loc) return;
    const n = name(req.body && req.body.name);
    if (!n) return res.status(400).json({ error: 'a name is required' });
    const num = loc.nextShelf || (loc.shelves || []).reduce((m, s) => Math.max(m, s.n), 0) + 1;
    loc.shelves = [...(loc.shelves || []), { n: num, name: n }];
    loc.nextShelf = num + 1;
    store.saveLocation(loc);
    store.log({ type: 'shelf-new', id: shelfId(loc.id, num), name: n, who: req.who || null });
    res.json({ ok: true, location: view(loc), shelf: shelfId(loc.id, num) });
  });

  router.put('/api/locations/:id/shelves/:n', json, (req, res) => {
    const loc = find(req, res); if (!loc) return;
    const shelf = (loc.shelves || []).find(s => s.n === Number(req.params.n));
    if (!shelf) return res.status(404).json({ error: 'no such shelf' });
    const n = name(req.body && req.body.name);
    if (!n) return res.status(400).json({ error: 'a name is required' });
    shelf.name = n;
    store.saveLocation(loc);
    store.syncPlaceText(shelfId(loc.id, shelf.n));
    res.json({ ok: true, location: view(loc) });
  });

  router.delete('/api/locations/:id/shelves/:n', (req, res) => {
    const loc = find(req, res); if (!loc) return;
    const num = Number(req.params.n);
    if (!(loc.shelves || []).some(s => s.n === num)) return res.status(404).json({ error: 'no such shelf' });
    const on = store.entriesAt(shelfId(loc.id, num)).length;
    if (on) return res.status(409).json({ error: `${on} item(s) are on this shelf; move them first` });
    loc.shelves = loc.shelves.filter(s => s.n !== num);
    store.saveLocation(loc);
    store.log({ type: 'shelf-deleted', id: shelfId(loc.id, num), who: req.who || null });
    res.json({ ok: true, location: view(loc) });
  });

  // What a scanned shelf QR opens: the place and everything filed on it.
  router.get('/api/places/:id', (req, res) => {
    const found = store.resolvePlace(req.params.id);
    if (!found) return res.status(404).json({ error: 'no such place' });
    const { location, shelf } = found;
    const id = shelf ? shelfId(location.id, shelf.n) : location.id;
    res.json({
      id, kind: shelf ? 'shelf' : 'location',
      name: placeName(location, shelf),
      shortName: shelf ? shelf.name : location.name,
      photo: !!(shelf ? shelf.photo : location.photo),
      locationId: location.id,
      locationName: location.name,
      shelves: shelf ? [] : (location.shelves || []).map(s => ({ ...s, id: shelfId(location.id, s.n), items: store.entriesAt(shelfId(location.id, s.n)).length })),
      items: store.entriesAt(id).map(e => ({
        id: e.id,
        name: e.unit ? `${e.item.name} #${e.unit.n}` : e.item.name,
        quantity: e.unit ? 1 : quantityOf(e.item),
        kind: e.item.kind || 'item',
        unit: !!e.unit,
        inherited: !!(e.unit && !e.own),          // here because the product is
        photoId: e.unit && e.unit.photo ? e.id : (e.item.photo ? e.item.id : null),
      })),
    });
  });

  // Filing something: remember the place and keep its text in step. Given a
  // unit id this files that one on its own shelf; clearing it puts the unit
  // back on whatever the product says, which is where they start.
  router.put('/api/items/:id/shelf', json, (req, res) => {
    const found = store.resolve(req.params.id);
    if (!found) return res.status(404).json({ error: 'no such item' });
    const { item, unit } = found;
    const target = unit || item;
    const shelf = req.body && req.body.shelf ? String(req.body.shelf).toLowerCase() : null;
    if (shelf && !store.resolvePlace(shelf)) return res.status(400).json({ error: 'no such place' });
    const fromShelf = target.shelf || undefined;               // so the old place's log says it left
    if (shelf) { target.shelf = shelf; target.location = store.placeText(shelf); }
    else {
      delete target.shelf;
      if (unit) delete target.location;                       // back to the product's
      else if (req.body && req.body.clear) target.location = '';
    }
    store.saveItem(item);
    store.log({ type: 'filed', id: unit ? `${item.id}-${unit.n}` : item.id, name: unit ? `${item.name} #${unit.n}` : item.name, shelf, fromShelf, who: req.who || null });
    res.json({ ok: true, item });
  });

  router.get('/l/:id', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'place.html')));
  router.get('/locations', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'locations.html')));

  return router;
};
