const test = require('node:test');
const assert = require('node:assert/strict');
const find = require('../verbs/find');
const { parseList } = require('../lib/parse');

const items = new Map([
  ['aaaa11', { id: 'aaaa11', name: 'M5 bolts 20 mm', quantity: 200, location: 'Cabinet C, drawer 4', tags: ['bolt'] }],
  ['cccc33', { id: 'cccc33', name: 'Multimeter', quantity: 4, location: 'Cabinet B' }],
]);
const store = { items, catalogue: () => [...items.values()] };

test('find by id, by text, and not found', async () => {
  const r = await find(parseList('aaaa11\nmultimeter\nzzzz99\nunicorn'), null, store);
  assert.equal(r[0].ok, true); assert.match(r[0].message, /Cabinet C, drawer 4/);
  assert.equal(r[1].ok, true); assert.deepEqual(r[1].matches, ['cccc33']);
  assert.equal(r[2].ok, false); // unknown id, no text match
  assert.equal(r[3].ok, false); assert.equal(r[3].message, 'not found');
});
