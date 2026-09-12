// All state: one JSON file per item / loan under data/, mirrored in memory.
// Writes are atomic (tmp + rename). Sync IO on purpose: simple, and tiny files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/o, 1/l/i

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
      photos: path.join(dir, 'photos'),
    };
    for (const d of Object.values(this.dirs)) fs.mkdirSync(d, { recursive: true });
    this.items = loadDir(this.dirs.items);
    this.loans = loadDir(this.dirs.loans);
    this.configFile = path.join(dir, 'config.json');
    this.config = fs.existsSync(this.configFile) ? JSON.parse(fs.readFileSync(this.configFile, 'utf8')) : {};
  }

  newId() {
    for (;;) {
      let id = '';
      for (let i = 0; i < 6; i++) id += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
      if (!this.items.has(id)) return id;
    }
  }

  saveItem(item) {
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

  // What the browser caches for instant search. No photos, no history.
  catalogue() {
    return [...this.items.values()].map(i => ({
      id: i.id, kind: i.kind || 'item', name: i.name, description: i.description || '',
      location: i.location || '', quantity: i.quantity ?? 0, tags: i.tags || [],
      photo: !!i.photo, locationPhoto: !!i.locationPhoto, updatedAt: i.updatedAt,
    }));
  }
}

module.exports = { Store, writeAtomic, ID_ALPHABET };
