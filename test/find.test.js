const test = require('node:test');
const assert = require('node:assert/strict');
const find = require('../verbs/find');
const { parseList } = require('../lib/parse');
const { makeStore } = require('./helpers');

const store = makeStore([
  { id: 'aaaa11', name: 'M5 bolts 20 mm', quantity: 200, location: 'Cabinet C, drawer 4', tags: ['bolt'] },
  { id: 'cccc33', name: 'Multimeter', quantity: 4, location: 'Cabinet B' },
  { id: 'scope1', name: 'Oscilloscope', location: 'Bench 3', tracked: true, units: [{ n: 1 }, { n: 2 }] },
]);

test('find by id, by text, and not found', async () => {
  const r = await find(parseList('aaaa11\nmultimeter\nzzzz99\nunicorn'), null, store);
  assert.equal(r[0].ok, true); assert.match(r[0].message, /Cabinet C, drawer 4/);
  assert.equal(r[1].ok, true); assert.deepEqual(r[1].matches.map(m => m.id), ['cccc33']); assert.equal(r[1].matches[0].name, 'Multimeter');
  assert.equal(r[2].ok, false);
  assert.equal(r[3].ok, false); assert.equal(r[3].message, 'not found');
});

test('trailing words are dropped until something matches', async () => {
  const [r] = await find(parseList('multimeter for the demo'), null, store);
  assert.equal(r.ok, true); assert.equal(r.matches[0].id, 'cccc33');
});

test('several matches come back as options', async () => {
  const [r] = await find(parseList('bolts'), null, store);
  assert.equal(r.matches.length, 1);
});

test('a unit id finds that one unit', async () => {
  const r = await find(parseList('scope1-2\nscope1\nscope1-9'), null, store);
  assert.equal(r[0].ok, true);
  assert.equal(r[0].item.id, 'scope1-2');
  assert.match(r[0].message, /Oscilloscope #2 · this one · Bench 3/);
  assert.equal(r[1].message, 'Oscilloscope · 2 · Bench 3');   // the product: two of them
  assert.equal(r[2].ok, false);                                // no ninth unit
});
