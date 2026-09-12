const test = require('node:test');
const assert = require('node:assert/strict');
const { splitUnitId, quantityOf, unitId } = require('../lib/units');
const { parseList } = require('../lib/parse');
const { makeStore } = require('./helpers');

test('unit ids split, and only in the right shape', () => {
  assert.deepEqual(splitUnitId('338va6-2'), { baseId: '338va6', n: 2 });
  assert.deepEqual(splitUnitId('338VA6-12'), { baseId: '338va6', n: 12 });
  assert.equal(splitUnitId('338va6'), null);
  assert.equal(splitUnitId('338va6-'), null);
  assert.equal(splitUnitId('338va6-x'), null);
  assert.equal(unitId('338va6', 3), '338va6-3');
});

test('the parser accepts a unit id, with a quantity and missing parts', () => {
  const [a, b] = parseList('s0ld3r-2 x1\ns0ld3r-3 - tweez1 x1');
  assert.equal(a.id, 's0ld3r-2');
  assert.equal(b.id, 's0ld3r-3');
  assert.deepEqual(b.missing, [{ id: 'tweez1', qty: 1 }]);
});

test('a tracked product counts its units, a bulk one keeps its quantity', () => {
  const store = makeStore([
    { id: 'bolts1', name: 'M5 bolts', quantity: 200 },
    { id: 'scope1', name: 'Scope', tracked: true, units: [{ n: 1 }, { n: 2 }, { n: 5 }], quantity: 99 },
  ]);
  assert.equal(quantityOf(store.items.get('bolts1')), 200);
  assert.equal(store.items.get('scope1').quantity, 3);   // derived on save, not the 99 given
  assert.equal(store.resolve('scope1-5').unit.n, 5);
  assert.equal(store.resolve('scope1-3'), null);
  assert.equal(store.resolve('bolts1-1'), null);          // bulk items have no units
  const row = store.catalogue().find(i => i.id === 'scope1');
  assert.deepEqual(row.units, [1, 2, 5]);
  assert.equal(row.tracked, true);
});

test('numbering is refused for a bulk quantity and for an empty one', async () => {
  const express = require('express');
  const { makeStore } = require('./helpers');
  const store = makeStore([
    { id: 'bolts1', name: 'M5 bolts', quantity: 200 },
    { id: 'none01', name: 'Nothing', quantity: 0 },
    { id: 'scope1', name: 'Scope', quantity: 2 },
  ]);
  const app = express();
  app.use(require('../routes/units')(store));
  const server = app.listen(0);
  const port = server.address().port;
  const put = (id, tracked) => fetch(`http://localhost:${port}/api/items/${id}/tracked`,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tracked }) });

  assert.equal((await put('bolts1', true)).status, 400);
  assert.equal(store.items.get('bolts1').tracked, undefined);
  assert.equal((await put('none01', true)).status, 400);

  assert.equal((await put('scope1', true)).status, 200);
  assert.deepEqual(store.items.get('scope1').units.map(u => u.n), [1, 2]);

  // add, retire, add again: numbers are never reused
  const post = () => fetch(`http://localhost:${port}/api/items/scope1/units`, { method: 'POST' });
  await post();
  await fetch(`http://localhost:${port}/api/items/scope1/units/2`, { method: 'DELETE' });
  await post();
  assert.deepEqual(store.items.get('scope1').units.map(u => u.n), [1, 3, 4]);

  assert.equal((await put('scope1', false)).status, 200);
  assert.equal(store.items.get('scope1').quantity, 3);
  assert.equal(store.items.get('scope1').units, undefined);
  server.close();
});
