const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { parseList } = require('../lib/parse');
const { makeStore } = require('./helpers');
const out = require('../verbs/out');
const checkIn = require('../verbs/in');
const { forItem, forPlace, forUser, page } = require('../lib/history');
const { overview } = require('../lib/overview');

function lab() {
  const store = makeStore([
    { id: 'meter1', name: 'Multimeter', quantity: 4, shelf: 'cab001-1', location: 'Cabinet A, drawer 1' },
    { id: 'scope1', name: 'Scope', tracked: true, units: [{ n: 1 }, { n: 2 }], shelf: 'cab001-2', location: 'Cabinet A, drawer 2' },
    { id: 'tape01', name: 'Tape', quantity: 9, consumable: true, shelf: 'cab002', location: 'Bench' },
  ]);
  store.saveLocation({ id: 'cab001', name: 'Cabinet A', shelves: [{ n: 1, name: 'drawer 1' }, { n: 2, name: 'drawer 2' }], nextShelf: 3 });
  store.saveLocation({ id: 'cab002', name: 'Bench', shelves: [] });
  return store;
}
const types = list => list.map(e => `${e.type}:${e.id}`);

test('one log, read by item, by place and by person', async () => {
  const store = lab();
  await out(parseList('meter1 x2\nscope1-2\ntape01 x3'), 'mari', store, {});
  await checkIn(parseList('scope1-2'), 'admin', store, {});

  // the product sees its numbered ones; a unit sees itself
  assert.deepEqual(types(forItem(store, 'scope1')), ['out:scope1-2', 'in:scope1-2']);
  assert.deepEqual(types(forItem(store, 'scope1-1')), []);
  assert.deepEqual(types(forItem(store, 'meter1')), ['out:meter1']);

  // a shelf sees what left it and came back; the location sees all its shelves
  assert.deepEqual(types(forPlace(store, 'cab001-2')), ['out:scope1-2', 'in:scope1-2']);
  assert.deepEqual(types(forPlace(store, 'cab001')), ['out:meter1', 'out:scope1-2', 'in:scope1-2']);
  assert.deepEqual(types(forPlace(store, 'cab002')), ['used:tape01']);

  // a person sees what they took, and their things being checked in by someone else
  assert.deepEqual(types(forUser(store, 'mari')), ['out:meter1', 'out:scope1-2', 'used:tape01', 'in:scope1-2']);
  assert.deepEqual(types(forUser(store, 'admin')), ['in:scope1-2']);

  // named for the page, newest first
  const [last] = page(store, forUser(store, 'mari'), 1);
  assert.equal(last.itemName, 'Scope #2');
  assert.equal(last.placeName, 'Cabinet A, drawer 2');
  assert.equal(last.from, 'mari');
  assert.equal(last.who, 'admin');
});

test('moving something shows in the log of both places', async () => {
  const store = lab();
  const app = express();
  app.use((req, res, next) => { req.who = 'jaan'; req.user = { username: 'jaan', role: 'user' }; next(); });
  app.use(require('../routes/locations')(store));
  const server = app.listen(0);
  const r = await fetch(`http://localhost:${server.address().port}/api/items/meter1/shelf`,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ shelf: 'cab002' }) });
  server.close();
  assert.equal(r.status, 200);
  const [moved] = page(store, forItem(store, 'meter1'));
  assert.deepEqual([moved.type, moved.shelf, moved.fromShelf, moved.who], ['filed', 'cab002', 'cab001-1', 'jaan']);
  assert.equal(moved.fromPlaceName, 'Cabinet A, drawer 1');
  assert.equal(forPlace(store, 'cab001-1').length, 1);   // it left here
  assert.equal(forPlace(store, 'cab002').length, 1);     // and arrived here
});

test('the overview says what is late by how much, who holds what, and where it is missing from', async () => {
  const store = lab();
  await out(parseList('meter1 x2\nscope1-1'), 'mari', store, {});
  await out(parseList('scope1-2'), 'jaan', store, {});
  const ago = days => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const loan = id => [...store.loans.values()].find(l => l.itemId === id);
  loan('meter1').dueAt = ago(3);
  loan('scope1-2').dueAt = ago(10);

  const o = overview(store);
  assert.deepEqual(o.totals, { loans: 3, things: 4, late: 2, people: 2 });
  assert.deepEqual(o.late.map(l => [l.name, l.who, l.daysLate]), [['Scope #2', 'jaan', 10], ['Multimeter', 'mari', 3]]);
  assert.deepEqual(o.people.map(p => [p.who, p.things, p.late, p.worst]), [['jaan', 1, 1, 10], ['mari', 3, 2, 3]]);
  assert.deepEqual(o.items.map(i => [i.id, i.things, i.worst]), [['scope1', 2, 10], ['meter1', 2, 3]]);
  assert.deepEqual(o.places.map(p => [p.placeName, p.things]), [['Cabinet A, drawer 2', 2], ['Cabinet A, drawer 1', 2]]);
});

test('a person\'s page is theirs and the admin\'s; the overview is the admin\'s', async () => {
  const store = lab();
  await out(parseList('meter1'), 'mari', store, {});
  const app = express();
  app.use((req, res, next) => { const [who, role] = String(req.headers['x-test-user'] || '').split(':'); req.who = who || null; req.user = who ? { username: who, role } : null; next(); });
  app.use(require('../routes/history')(store));
  const server = app.listen(0);
  const get = (url, user) => fetch(`http://localhost:${server.address().port}${url}`, { headers: user ? { 'x-test-user': user } : {} });

  assert.equal((await get('/api/people/mari')).status, 401);
  assert.equal((await get('/api/people/mari', 'jaan:user')).status, 403);
  assert.equal((await get('/api/people/mari/history', 'jaan:user')).status, 403);
  const mine = await (await get('/api/people/me', 'mari:user')).json();
  assert.deepEqual(mine.open.map(l => [l.name, l.outstanding, l.daysLate]), [['Multimeter', 1, 0]]);
  assert.equal((await get('/api/people/mari/history', 'root:admin')).status, 200);
  assert.equal((await get('/api/overview', 'mari:user')).status, 403);
  assert.equal((await get('/api/overview', 'root:admin')).status, 200);
  assert.equal((await (await get('/api/items/meter1/history')).json())[0].type, 'out');   // open, like the catalogue
  assert.equal((await get('/api/places/nowhere/history')).status, 404);
  server.close();
});
