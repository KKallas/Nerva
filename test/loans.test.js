const test = require('node:test');
const assert = require('node:assert/strict');
const { parseList } = require('../lib/parse');
const { makeStore } = require('./helpers');
const out = require('../verbs/out');
const checkIn = require('../verbs/in');
const find = require('../verbs/find');
const { today, dueDate } = require('../lib/loans');

const stock = () => makeStore([
  { id: 'meter1', name: 'Multimeter', quantity: 4 },
  { id: 'bolts1', name: 'M5 bolts', quantity: 200, consumable: true },
  { id: 'scope1', name: 'Scope', tracked: true, units: [{ n: 1 }, { n: 2 }] },
]);
const later = days => dueDate({ loanDays: days });   // a local day, that many from now

test('out saves one checkout under your name, with the return date', async () => {
  const store = stock();
  const due = later(3);
  const r = await out(parseList('[meter1] Multimeter x2\n[scope1-2] Scope #2'), 'mari', store, { due });
  assert.deepEqual(r.map(l => l.ok), [true, true]);
  const loans = [...store.loans.values()];
  assert.equal(loans.length, 2);
  assert.ok(loans.every(l => l.who === 'mari' && l.dueAt === due && l.checkout === 'C00001' && !l.returnedAt));
  assert.equal(store.items.get('meter1').quantity, 2);      // left the shelf
  assert.equal(store.items.get('scope1').quantity, 2);      // a numbered one still exists
  // the next list is a checkout of its own
  const [again] = await out(parseList('meter1'), 'jaan', store, {});
  assert.equal(again.checkout, 'C00002');
  assert.equal(again.loan, 'L00003');
});

test('no return date means today plus the loan period; a past one is refused', async () => {
  const store = stock();
  store.config.loanDays = 7;
  const [r] = await out(parseList('meter1'), 'mari', store, {});
  assert.equal(r.due, later(7));
  await assert.rejects(out(parseList('meter1'), 'mari', store, { due: '2020-01-01' }), /in the past/);
  await assert.rejects(out(parseList('meter1'), 'mari', store, { due: 'friday' }), /must look like/);
  await assert.rejects(out(parseList('meter1'), null, store, {}), /log in/);
});

test('things that get used up leave the shelf and make no loan', async () => {
  const store = stock();
  const [r] = await out(parseList('[bolts1] M5 bolts x10'), 'mari', store, {});
  assert.equal(r.ok, true);
  assert.match(r.message, /not expected back · 190 left/);
  assert.equal(r.checkout, undefined);
  assert.equal(store.loans.size, 0);
  assert.equal(store.items.get('bolts1').quantity, 190);
});

test('a numbered one that is out is refused, with who has it and until when', async () => {
  const store = stock();
  const due = later(5);
  await out(parseList('scope1-1'), 'mari', store, { due });
  const [again] = await out(parseList('scope1-1'), 'jaan', store, {});
  assert.equal(again.ok, false);
  assert.equal(again.message, `Scope #1 is out with mari until ${due}`);
  // the product without a number offers only the ones still on the shelf
  const [which] = await out(parseList('scope1'), 'jaan', store, {});
  assert.equal(which.ok, false);
  assert.deepEqual(which.matches.map(m => m.id), ['scope1-2']);
  // and looking it up says the same thing before anyone tries
  const [looked] = await find(parseList('scope1-1'), null, store);
  assert.match(looked.message, new RegExp(`out with mari until ${due}`));
  assert.deepEqual(store.catalogue().find(i => i.id === 'scope1').out, [{ id: 'scope1-1', who: 'mari', qty: 1, due }]);
});

test('taking more than the shelf says is allowed: the count was wrong', async () => {
  const store = stock();
  const [r] = await out(parseList('meter1 x6'), 'mari', store, {});
  assert.equal(r.ok, true);
  assert.match(r.message, /the shelf said 4/);
  assert.equal(store.items.get('meter1').quantity, 0);
});

test('in closes loans soonest due first, and puts a quantity back on the shelf', async () => {
  const store = stock();
  await out(parseList('meter1 x2'), 'mari', store, { due: later(9) });
  await out(parseList('meter1 x1'), 'jaan', store, { due: later(2) });
  const [r] = await checkIn(parseList('meter1 x2'), 'admin', store, {});
  assert.equal(r.ok, true);
  assert.match(r.message, /back from jaan, mari · 1 still out/);
  const [maris, jaans] = [...store.loans.values()];
  assert.ok(jaans.returnedAt && jaans.returnedTo === 'admin');
  assert.equal(maris.returned, 1);
  assert.equal(maris.returnedAt, null);
  assert.equal(store.items.get('meter1').quantity, 3);
  const [none] = await checkIn(parseList('scope1-1'), 'admin', store, {});
  assert.equal(none.ok, false);
  assert.match(none.message, /is not out/);
});

test('in can be narrowed to one checkout, and is marked as an admin verb', async () => {
  const store = stock();
  await out(parseList('meter1'), 'mari', store, {});
  await out(parseList('meter1'), 'jaan', store, {});
  const [r] = await checkIn(parseList('meter1'), 'admin', store, { checkout: 'c00002' });
  assert.match(r.message, /back from jaan/);
  assert.equal(checkIn.admin, true);
  assert.equal(out.admin, undefined);
  assert.equal(today().length, 10);
});

test('over HTTP: anyone logged in checks out, only an admin checks in, a borrower moves their own date', async () => {
  const express = require('express');
  const store = stock();
  const app = express();
  // stand in for lib/who.js: the test says who is asking
  app.use((req, res, next) => { const [who, role] = String(req.headers['x-test-user'] || '').split(':'); req.who = who || null; req.user = who ? { username: who, role } : null; next(); });
  app.use(require('../routes/file')(store));
  app.use(require('../routes/loans')(store));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const file = (verb, user, text) => fetch(`${base}/api/file?verb=${verb}`, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-test-user': user }, body: text });

  assert.equal((await file('out', 'mari:user', 'meter1 x2')).status, 200);
  assert.equal((await file('in', 'mari:user', 'meter1')).status, 403);
  assert.equal(store.items.get('meter1').quantity, 2);      // still out

  const move = (user, due) => fetch(`${base}/api/checkouts/C00001/due`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-test-user': user }, body: JSON.stringify({ due }) });
  assert.equal((await move('jaan:user', later(20))).status, 403);
  assert.equal((await move('mari:user', later(20))).status, 200);
  const mine = await (await fetch(`${base}/api/loans?open=1&mine=1`, { headers: { 'x-test-user': 'mari:user' } })).json();
  assert.deepEqual(mine.map(l => [l.name, l.outstanding, l.dueAt, l.overdue]), [['Multimeter', 2, later(20), false]]);

  assert.equal((await file('in', 'root:admin', 'meter1 x2')).status, 200);
  assert.equal(store.items.get('meter1').quantity, 4);
  server.close();
});
