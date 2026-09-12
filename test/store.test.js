const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../lib/store');

test('save, reload, delete, log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerva-'));
  const s = new Store(dir);
  const id = s.newId();
  assert.match(id, /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/);
  s.saveItem({ id, name: 'Thing', quantity: 2 });
  s.log({ type: 'test', id });
  assert.ok(!fs.existsSync(path.join(dir, 'items', id + '.json.tmp')));
  const s2 = new Store(dir);
  assert.equal(s2.items.get(id).name, 'Thing');
  assert.equal(s2.catalogue()[0].quantity, 2);
  s2.deleteItem(id);
  assert.equal(new Store(dir).items.size, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').split('\n').filter(Boolean).length, 1);
  fs.rmSync(dir, { recursive: true });
});
