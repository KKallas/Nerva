// Reading log.jsonl back. There is one log, and every event in it can be
// found three ways: by the thing (`id`), by the place it happened at (`place`,
// or `shelf` / `fromShelf` when something was moved), and by the person (`who`
// did it, `from` is whose loan it was, `user` is the account it was about).
// The pages for an item, a place and a person are three filters over the same
// lines. At this scale the file is read whole; nothing is indexed.
const fs = require('fs');
const path = require('path');
const { splitUnitId } = require('./units');
const { findByUsername } = require('./users');

function events(store) {
  const f = path.join(store.dir, 'log.jsonl');
  if (!fs.existsSync(f)) return [];
  const out = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch {}
  }
  return out;
}

const under = (value, id) => !!value && (value === id || String(value).startsWith(id + '-'));

// A product sees what happened to it and to every numbered one of it. One
// numbered unit sees its own events and the product's, since where the
// product is filed is where the unit is, unless it has a place of its own.
function forItem(store, rawId) {
  const id = String(rawId).toLowerCase();
  const parts = splitUnitId(id);
  return events(store).filter(e => (parts ? e.id === id || e.id === parts.baseId : under(e.id, id)));
}

// A shelf sees what was put on it, moved off it, taken from it and brought
// back to it. A location sees all of that for every shelf it holds.
function forPlace(store, rawId) {
  const id = String(rawId).toLowerCase();
  return events(store).filter(e => under(e.place, id) || under(e.shelf, id) || under(e.fromShelf, id)
    || (under(e.id, id) && /^(location|shelf|place)-/.test(e.type)));
}

// Everything a person did, and everything done about them: their loans being
// checked in by an admin, their account being made or reset.
function forUser(store, username) {
  return events(store).filter(e => e.who === username || e.from === username || e.user === username);
}

// Names for the page. Looked up now, so a renamed item reads right; what was
// written down at the time is the fallback for things that no longer exist.
function describe(store, e) {
  const found = e.id && store.resolve(e.id);
  const person = u => { const p = u && findByUsername(store, u); return p ? p.name : u || null; };
  return {
    ...e,
    itemName: found ? found.item.name + (found.unit ? ` #${found.unit.n}` : '') : e.name || null,
    isItem: !!found,
    placeName: store.placeText(e.place || e.shelf) || null, placeId: e.place || e.shelf || null,
    fromPlaceName: store.placeText(e.fromShelf) || null,
    whoName: person(e.who), fromName: typeof e.from === 'string' ? person(e.from) : null,
  };
}

// Newest first, named, at most `limit`.
const page = (store, list, limit) => list.reverse().slice(0, Math.min(500, Number(limit) || 30)).map(e => describe(store, e));

module.exports = { events, forItem, forPlace, forUser, describe, page };
