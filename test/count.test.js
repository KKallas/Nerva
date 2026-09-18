const test = require('node:test');
const assert = require('node:assert/strict');
const count = require('../verbs/count');
const { parseList } = require('../lib/parse');
const { makeStore } = require('./helpers');
const { events } = require('../lib/history');

const store = makeStore([
  { id: 'aaaa11', name: 'M5 bolts 20 mm', quantity: 200, shelf: 'cab003-4', location: 'Cabinet C, drawer 4' },
  { id: 'cccc33', name: 'Multimeter', quantity: 4 },
  { id: 'scope1', name: 'Oscilloscope', tracked: true, units: [{ n: 1 }, { n: 2 }] },
]);

test('count sets the quantity, down to zero, and logs the difference at the shelf', async () => {
  const r = await count(parseList('[aaaa11] M5 bolts x150\n[cccc33] Multimeter x0'), 'mari', store);
  assert.equal(r[0].ok, true); assert.match(r[0].message, /200 → 150/);
  assert.equal(store.items.get('aaaa11').quantity, 150);
  assert.equal(r[1].ok, true); assert.equal(store.items.get('cccc33').quantity, 0);
  const log = events(store).filter(e => e.type === 'count');
  assert.equal(log.length, 2);
  assert.deepEqual([log[0].was, log[0].to, log[0].delta, log[0].place, log[0].who], [200, 150, -50, 'cab003-4', 'mari']);
});

test('numbered products and their units are not counted', async () => {
  const r = await count(parseList('scope1 x3\nscope1-2 x1'), 'mari', store);
  assert.equal(r[0].ok, false); assert.match(r[0].message, /numbered/);
  assert.equal(r[1].ok, false); assert.match(r[1].message, /one numbered object/);
});

test('a name instead of an id comes back with options, nothing changed', async () => {
  const before = store.items.get('cccc33').quantity;
  const [r] = await count(parseList('multimeter x7'), 'mari', store);
  assert.equal(r.ok, false); assert.equal(r.matches[0].id, 'cccc33');
  assert.equal(store.items.get('cccc33').quantity, before);
});
