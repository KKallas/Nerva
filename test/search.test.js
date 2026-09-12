const test = require('node:test');
const assert = require('node:assert/strict');
const { search } = require('../lib/search');

const items = [
  { id: 'aaaa11', name: 'M5 bolts 20 mm', tags: ['bolt', 'screw', 'hex'], location: 'Cabinet C, drawer 4' },
  { id: 'bbbb22', name: 'M3 bolts 10 mm', tags: ['bolt'], location: 'Cabinet C, drawer 2' },
  { id: 'cccc33', name: 'Multimeter', description: 'UNI-T UT61E', location: 'Cabinet B' },
];

test('every word must match, case-insensitive, across fields', () => {
  assert.deepEqual(search(items, 'm5 20').map(i => i.id), ['aaaa11']);
  assert.deepEqual(search(items, 'BOLT drawer').map(i => i.id).sort(), ['aaaa11', 'bbbb22']);
  assert.deepEqual(search(items, 'ut61e').map(i => i.id), ['cccc33']);
  assert.deepEqual(search(items, 'nothing here'), []);
  assert.deepEqual(search(items, ''), []);
});

test('name matches rank above tag-only matches', () => {
  assert.equal(search([{ id: 'x', name: 'Screwdriver', tags: [] }, { id: 'y', name: 'M5 bolts', tags: ['screw'] }], 'screw')[0].id, 'x');
});
