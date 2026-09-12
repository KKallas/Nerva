// A real Store in a throwaway folder, so verb tests exercise real lookups
// (units included) instead of a hand-written stub that can drift.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');

function makeStore(items) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerva-test-'));
  const store = new Store(dir);
  for (const i of items || []) store.saveItem({ kind: 'item', quantity: 1, ...i });
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
  return store;
}

module.exports = { makeStore };
