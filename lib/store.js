// All state: one JSON file per item / loan under data/, mirrored in memory.
// Writes are atomic (tmp + rename). Sync IO on purpose: simple, and tiny files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { splitUnitId, quantityOf, placeOf } = require('./units');
const { placeName } = require('./places');

const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/o, 1/l/i

const DEFAULT_CONFIG = {
  labName: 'Robotics lab',
  lowStock: 2,        // at or below this, an item counts as low
  loanDays: 14,
};

function writeAtomic(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function loadDir(dir) {
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (obj && obj.id) map.set(obj.id, obj);
    } catch (e) {
      console.error('skipping unreadable', f, e.message);
    }
  }
  return map;
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.dirs = {
      items: path.join(dir, 'items'),
      loans: path.join(dir, 'loans'),
      locations: path.join(dir, 'locations'),
      photos: path.join(dir, 'photos'),
    };
    for (const d of Object.values(this.dirs)) fs.mkdirSync(d, { recursive: true });
    this.items = loadDir(this.dirs.items);
    this.loans = loadDir(this.dirs.loans);
    this.locations = loadDir(this.dirs.locations);
    this.configFile = path.join(dir, 'config.json');
    this.config = this.readJson(this.configFile, DEFAULT_CONFIG);
    // runtime.json is written by whatever is exposing the app right now
    // (bin/tunnel.js). It is not settings: it is gone when nothing is running.
    this.runtimeFile = path.join(dir, 'runtime.json');
  }

  readJson(file, fallback) {
    try { return { ...fallback, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
    catch { return { ...fallback }; }
  }

  saveConfig(patch) {
    this.config = { ...this.config, ...patch };
    writeAtomic(this.configFile, JSON.stringify(this.config, null, 2));
    return this.config;
  }

  get runtime() { return this.readJson(this.runtimeFile, {}); }
  setRuntime(v) { writeAtomic(this.runtimeFile, JSON.stringify(v, null, 2)); }

  newId() {
    for (;;) {
      let id = '';
      for (let i = 0; i < 6; i++) id += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
      if (!this.items.has(id) && !this.locations.has(id)) return id;
    }
  }

  // A location ("cab003") or one of its shelves ("cab003-4").
  resolvePlace(rawId) {
    const id = String(rawId || '').toLowerCase();
    const parts = splitUnitId(id);
    if (parts) {
      const location = this.locations.get(parts.baseId);
      const shelf = location && (location.shelves || []).find(s => s.n === parts.n);
      return shelf ? { location, shelf } : null;
    }
    const location = this.locations.get(id);
    return location ? { location, shelf: null } : null;
  }

  // The text shown on an item and searched over, e.g. "Cabinet C, drawer 4".
  placeText(placeId) {
    const p = this.resolvePlace(placeId);
    return p ? placeName(p.location, p.shelf) : '';
  }

  saveLocation(location) {
    location.updatedAt = new Date().toISOString();
    if (!location.createdAt) location.createdAt = location.updatedAt;
    this.locations.set(location.id, location);
    writeAtomic(path.join(this.dirs.locations, location.id + '.json'), JSON.stringify(location, null, 2));
    return location;
  }

  deleteLocation(id) {
    this.locations.delete(id);
    const f = path.join(this.dirs.locations, id + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // What is filed at this place, counting each numbered one separately: three
  // soldering sets on a shelf are three things there, not one product.
  // A location includes everything on its shelves.
  entriesAt(placeId) {
    const id = String(placeId || '').toLowerCase();
    const here = s => s === id || String(s || '').startsWith(id + '-');
    const out = [];
    for (const item of this.items.values()) {
      if (item.tracked) {
        for (const unit of item.units || []) {
          const p = placeOf(item, unit);
          if (here(p.shelf)) out.push({ item, unit, id: `${item.id}-${unit.n}`, own: p.own });
        }
      } else if (here(item.shelf)) {
        out.push({ item, unit: null, id: item.id, own: true });
      }
    }
    return out;
  }

  // Renaming a place rewrites the text denormalised onto whatever is filed
  // there, so search and the catalogue never need to know places are records.
  syncPlaceText(placeId) {
    let n = 0;
    for (const e of this.entriesAt(placeId)) {
      const target = e.unit && e.unit.shelf ? e.unit : e.item;      // an inherited place is the product's to fix
      if (e.unit && !e.unit.shelf) continue;
      const text = this.placeText(target.shelf);
      if (text && target.location !== text) { target.location = text; this.saveItem(e.item); n++; }
    }
    return n;
  }

  // Last events for one id, newest first. The log is small at this scale, so
  // reading it whole is simpler than any index.
  history(id, limit) {
    const f = path.join(this.dir, 'log.jsonl');
    if (!fs.existsSync(f)) return [];
    const out = [];
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (!line || !line.includes(id)) continue;
      try { const e = JSON.parse(line); if (e.id === id) out.push(e); } catch {}
    }
    return out.reverse().slice(0, limit || 20);
  }

  // Look up either a product ("338va6") or one of its units ("338va6-2").
  // Returns { item, unit } with unit null for a product, or null if unknown.
  resolve(rawId) {
    const id = String(rawId || '').toLowerCase();
    const parts = splitUnitId(id);
    if (parts) {
      const item = this.items.get(parts.baseId);
      const unit = item && (item.units || []).find(u => u.n === parts.n);
      return unit ? { item, unit } : null;
    }
    const item = this.items.get(id);
    return item ? { item, unit: null } : null;
  }

  saveItem(item) {
    // A tracked product's quantity is not a field anyone edits: it is how many
    // units exist. Keeping it in sync means search and the catalogue need no
    // special case.
    if (item.tracked) { item.units = item.units || []; item.quantity = quantityOf(item); }
    item.updatedAt = new Date().toISOString();
    if (!item.createdAt) item.createdAt = item.updatedAt;
    this.items.set(item.id, item);
    writeAtomic(path.join(this.dirs.items, item.id + '.json'), JSON.stringify(item, null, 2));
    return item;
  }

  deleteItem(id) {
    this.items.delete(id);
    const f = path.join(this.dirs.items, id + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  saveLoan(loan) {
    this.loans.set(loan.id, loan);
    writeAtomic(path.join(this.dirs.loans, loan.id + '.json'), JSON.stringify(loan, null, 2));
    return loan;
  }

  log(event) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(path.join(this.dir, 'log.jsonl'), line);
  }

  // Which photo stands for this product in a list: its own, or failing that
  // the first of its numbered ones that has been photographed. A numbered
  // product has no photo of its own, so without this the list shows nothing
  // even when every one of them has been pictured.
  previewId(item) {
    if (item.photo) return item.id;
    if (item.tracked) {
      const unit = (item.units || []).find(u => u.photo);
      if (unit) return `${item.id}-${unit.n}`;
    }
    return null;
  }

  // What the browser caches for instant search. No photos, no history.
  catalogue() {
    return [...this.items.values()].map(i => ({
      id: i.id, kind: i.kind || 'item', name: i.name, description: i.description || '',
      location: i.location || '', quantity: quantityOf(i), tags: i.tags || [],
      tracked: !!i.tracked, units: i.tracked ? (i.units || []).map(u => u.n) : undefined,
      photo: !!i.photo, locationPhoto: !!i.locationPhoto, previewId: this.previewId(i), updatedAt: i.updatedAt,
    }));
  }
}

module.exports = { Store, writeAtomic, ID_ALPHABET, DEFAULT_CONFIG };
