const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const U = require('../lib/users');
const who = require('../lib/who');
const { makeStore } = require('./helpers');

test('passwords hash, check, and never match a wrong one', () => {
  const user = { password: U.hashPassword('hunter22') };
  assert.match(user.password, /^scrypt\$/);
  assert.ok(U.checkPassword(user, 'hunter22'));
  assert.ok(!U.checkPassword(user, 'hunter23'));
  assert.ok(!U.checkPassword({ password: null }, ''));
  assert.ok(U.passwordProblem('short'));
  assert.equal(U.passwordProblem('long enough'), null);
});

test('usernames are checked and unique; the built-in admin is made once', () => {
  const store = makeStore();
  const admin = U.ensureAdmin(store);
  assert.equal(admin.username, 'admin');
  assert.equal(admin.role, 'admin');
  assert.equal(U.ensureAdmin(store).id, admin.id);
  const mari = U.makeUser(store, { username: ' Mari ', name: 'Mari Tamm' });
  assert.equal(mari.username, 'mari');
  assert.equal(mari.password, null);
  assert.match(mari.card, /^[0-9a-f-]{36}$/);
  assert.throws(() => U.makeUser(store, { username: 'mari' }), /taken/);
  assert.throws(() => U.makeUser(store, { username: 'no spaces' }), /username/);
  assert.equal(U.publicUser(mari).card, undefined);
  assert.equal(U.publicUser(mari).password, undefined);
});

test('a cookie is signed and ends when the session is bumped', () => {
  const store = makeStore();
  const user = U.makeUser(store, { username: 'mari' });
  const secret = who.sessionSecret(store);
  const cookie = who.cookieFor(secret, user);
  assert.equal(who.userFromCookie(store, secret, cookie).id, user.id);
  assert.equal(who.userFromCookie(store, secret, cookie.slice(0, -2) + 'xx'), null);
  assert.equal(who.userFromCookie(store, 'another secret', cookie), null);
  user.session++;
  assert.equal(who.userFromCookie(store, secret, cookie), null);
});

test('card first sets the password, then username or card with it logs in', async () => {
  const store = makeStore([{ id: 'bolts1', name: 'M5 bolts', quantity: 5 }]);
  const admin = U.ensureAdmin(store);
  const app = express();
  app.use(who.identify(store));
  app.use('/api', who.guardWrites);
  app.use(require('../routes/login')(store));
  app.use(require('../routes/users')(store));
  app.use(require('../routes/count')(store));
  app.use(require('../routes/file')(store));
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, url, body, headers) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
    const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
    return { status: r.status, data: await r.json(), cookie };
  };
  const as = cookie => ({ cookie });

  // looking up needs nobody; changing something does
  assert.equal((await call('POST', '/api/file?verb=find', { text: 'bolts1' })).status, 200);
  assert.equal((await call('POST', '/api/items/bolts1/count', { quantity: 3 })).status, 401);

  // a username alone cannot claim an account that has no password yet
  assert.equal((await call('POST', '/api/login', { username: 'admin', password: 'whatever1' })).data.needsCard, true);
  assert.equal((await call('GET', `/api/login/card/${admin.card}`)).data.hasPassword, false);
  assert.equal((await call('POST', '/api/login', { card: admin.card, password: 'short' })).status, 400);
  const first = await call('POST', '/api/login', { card: admin.card, password: 'admin-pass' });
  assert.equal(first.status, 200);
  const adminCookie = first.cookie;
  assert.equal((await call('GET', '/api/me', null, as(adminCookie))).data.user.username, 'admin');
  // using the app renews the cookie, so you stay logged in while you use it
  assert.ok((await call('GET', '/api/me', null, as(adminCookie))).cookie.startsWith('nerva='));

  // admin adds mari; mari is not an admin
  const mari = (await call('POST', '/api/users', { username: 'mari', name: 'Mari' }, as(adminCookie))).data.user;
  assert.ok(mari.card);
  assert.equal((await call('POST', '/api/users', { username: 'mari' }, as(adminCookie))).status, 409);
  const m1 = await call('POST', '/api/login', { card: mari.card, password: 'mari-pass' });
  assert.equal((await call('GET', '/api/users', null, as(m1.cookie))).status, 403);

  // later: username + password, or card + password
  assert.equal((await call('POST', '/api/login', { username: 'MARI', password: 'mari-pass' })).status, 200);
  assert.equal((await call('POST', '/api/login', { username: 'mari', password: 'nope-nope' })).status, 401);
  assert.equal((await call('POST', '/api/login', { card: mari.card, password: 'nope-nope' })).status, 401);
  assert.equal((await call('POST', '/api/login', { card: mari.card, password: 'mari-pass' })).status, 200);

  // the write is logged under the username; scripts use basic auth
  assert.equal((await call('POST', '/api/items/bolts1/count', { quantity: 3 }, as(m1.cookie))).status, 200);
  const basic = { authorization: 'Basic ' + Buffer.from('mari:mari-pass').toString('base64') };
  assert.equal((await call('POST', '/api/items/bolts1/count', { quantity: 4 }, basic)).status, 200);
  assert.equal(require('../lib/history').forItem(store, 'bolts1').pop().who, 'mari');

  // forgotten password: sessions end, the card asks again
  await call('POST', `/api/users/${mari.id}/reset`, null, as(adminCookie));
  assert.equal((await call('GET', '/api/me', null, as(m1.cookie))).data.user, null);
  assert.equal((await call('GET', `/api/login/card/${mari.card}`)).data.hasPassword, false);

  // lost card: the old one stops working
  await call('POST', `/api/users/${mari.id}/card`, null, as(adminCookie));
  assert.equal((await call('GET', `/api/login/card/${mari.card}`)).status, 404);

  // the built-in admin stays
  assert.equal((await call('DELETE', `/api/users/${admin.id}`, null, as(adminCookie))).status, 400);
  assert.equal((await call('PUT', `/api/users/${admin.id}`, { role: 'user' }, as(adminCookie))).status, 400);
  assert.equal((await call('DELETE', `/api/users/${mari.id}`, null, as(adminCookie))).status, 200);
  server.close();
});
