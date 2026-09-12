const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { makeStore } = require('./helpers');

function serve(store) {
  const app = express();
  app.use(require('../routes/locations')(store));
  app.use(require('../routes/count')(store));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, url, body) => {
    const r = await fetch(base + url, body === undefined ? { method }
      : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  return { call, close: () => server.close() };
}

test('locations, shelves, filing, renaming and the guards around deleting', async () => {
  const store = makeStore([{ id: 'bolts1', name: 'M5 bolts', quantity: 200, location: 'somewhere' }]);
  const { call, close } = serve(store);

  const made = await call('POST', '/api/locations', { name: 'Cabinet C' });
  const loc = made.body.location.id;
  assert.equal(made.status, 200);
  assert.equal((await call('POST', '/api/locations', { name: '  ' })).status, 400);

  const shelf = (await call('POST', `/api/locations/${loc}/shelves`, { name: 'drawer 4' })).body.shelf;
  assert.equal(shelf, `${loc}-1`);

  // filing writes both the reference and the readable text search uses
  assert.equal((await call('PUT', '/api/items/bolts1/shelf', { shelf })).status, 200);
  assert.equal(store.items.get('bolts1').shelf, shelf);
  assert.equal(store.items.get('bolts1').location, 'Cabinet C, drawer 4');
  assert.equal((await call('PUT', '/api/items/bolts1/shelf', { shelf: 'nope-9' })).status, 400);

  // renaming rewrites the text on everything filed there
  await call('PUT', `/api/locations/${loc}`, { name: 'Cabinet Charlie' });
  assert.equal(store.items.get('bolts1').location, 'Cabinet Charlie, drawer 4');

  // a place holding things cannot be deleted out from under them
  assert.equal((await call('DELETE', `/api/locations/${loc}/shelves/1`)).status, 409);
  assert.equal((await call('DELETE', `/api/locations/${loc}`)).status, 409);

  const place = (await call('GET', `/api/places/${shelf}`)).body;
  assert.equal(place.name, 'Cabinet Charlie, drawer 4');
  assert.deepEqual(place.items.map(i => i.name), ['M5 bolts']);

  // unfiled again, then both can go; shelf numbers are not reused
  await call('PUT', '/api/items/bolts1/shelf', { shelf: null });
  assert.equal((await call('DELETE', `/api/locations/${loc}/shelves/1`)).status, 200);
  assert.equal((await call('POST', `/api/locations/${loc}/shelves`, { name: 'drawer 5' })).body.shelf, `${loc}-2`);
  close();
});

test('counting records the change and refuses numbered items', async () => {
  const store = makeStore([
    { id: 'bolts1', name: 'M5 bolts', quantity: 200 },
    { id: 'scope1', name: 'Scope', tracked: true, units: [{ n: 1 }] },
  ]);
  const { call, close } = serve(store);

  const r = await call('POST', '/api/items/bolts1/count', { quantity: 187 });
  assert.deepEqual([r.body.from, r.body.to, r.body.delta], [200, 187, -13]);
  assert.equal(store.items.get('bolts1').quantity, 187);

  assert.equal((await call('POST', '/api/items/bolts1/count', { quantity: -1 })).status, 400);
  assert.equal((await call('POST', '/api/items/bolts1/count', { quantity: 'abc' })).status, 400);
  assert.equal((await call('POST', '/api/items/scope1/count', { quantity: 5 })).status, 400);

  const history = (await call('GET', '/api/items/bolts1/history')).body;
  assert.equal(history[0].type, 'count');
  assert.equal(history[0].delta, -13);
  close();
});

test('the count verb applies a list and reports each line', async () => {
  const count = require('../verbs/count');
  const { parseList } = require('../lib/parse');
  const store = makeStore([
    { id: 'bolts1', name: 'M5 bolts', quantity: 200 },
    { id: 'scope1', name: 'Scope', tracked: true, units: [{ n: 1 }, { n: 2 }] },
  ]);
  const r = await count(parseList('bolts1 x187\nscope1 x2\nscope1-1\nnothing here'), { email: 'a@b.c' }, store);
  assert.equal(r[0].ok, true); assert.match(r[0].message, /200 → 187/);
  assert.equal(store.items.get('bolts1').quantity, 187);
  assert.equal(r[1].ok, false); assert.match(r[1].message, /numbered/);
  assert.equal(r[2].ok, false); assert.match(r[2].message, /one numbered object/);
  assert.equal(r[3].ok, false);
});

test('a numbered one can live somewhere of its own, or wherever the product does', async () => {
  const store = makeStore([{ id: 'scope1', name: 'Scope', tracked: true, units: [{ n: 1 }, { n: 2 }] }]);
  const { call, close } = serve(store);
  const loc = (await call('POST', '/api/locations', { name: 'Cabinet C' })).body.location.id;
  const a = (await call('POST', `/api/locations/${loc}/shelves`, { name: 'drawer 1' })).body.shelf;
  const b = (await call('POST', `/api/locations/${loc}/shelves`, { name: 'drawer 2' })).body.shelf;

  // the product's shelf is where they all are
  await call('PUT', '/api/items/scope1/shelf', { shelf: a });
  assert.equal((await call('GET', `/api/places/${a}`)).body.items.length, 2);
  assert.deepEqual((await call('GET', `/api/places/${a}`)).body.items.map(i => i.inherited), [true, true]);

  // one of them is kept elsewhere
  await call('PUT', '/api/items/scope1-2/shelf', { shelf: b });
  assert.deepEqual((await call('GET', `/api/places/${a}`)).body.items.map(i => i.id), ['scope1-1']);
  const onB = (await call('GET', `/api/places/${b}`)).body.items;
  assert.deepEqual(onB.map(i => [i.id, i.name, i.inherited]), [['scope1-2', 'Scope #2', false]]);
  assert.equal(store.items.get('scope1').units[1].location, 'Cabinet C, drawer 2');

  // the whole cabinet holds both of them
  assert.equal((await call('GET', `/api/places/${loc}`)).body.items.length, 2);

  // renaming that shelf follows the one filed on it
  await call('PUT', `/api/locations/${loc}/shelves/2`, { name: 'drawer two' });
  assert.equal(store.items.get('scope1').units[1].location, 'Cabinet C, drawer two');

  // and a shelf with something on it still cannot be deleted
  assert.equal((await call('DELETE', `/api/locations/${loc}/shelves/2`)).status, 409);

  // putting it back with the rest clears its own place
  await call('PUT', '/api/items/scope1-2/shelf', { shelf: null });
  assert.equal(store.items.get('scope1').units[1].shelf, undefined);
  assert.equal(store.items.get('scope1').units[1].location, undefined);
  assert.equal((await call('GET', `/api/places/${a}`)).body.items.length, 2);
  close();
});
