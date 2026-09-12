const test = require('node:test');
const assert = require('node:assert/strict');
const { parseList } = require('../lib/parse');

test('ids, quantities, notes, text, comments', () => {
  const lines = parseList(`a7k3q9\nB2X8   x3 for the demo\n\n# ignored\nJumper wires 40pc\n`);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], { n: 1, raw: 'a7k3q9', text: 'a7k3q9', id: 'a7k3q9', qty: 1, note: '', missing: [] });
  assert.equal(lines[1].id, 'b2x8'); assert.equal(lines[1].qty, 3); assert.equal(lines[1].note, 'for the demo');
  assert.equal(lines[2].text, 'Jumper wires 40pc');
  assert.equal(lines[2].id, 'jumper'); // looks like an id; verbs decide whether it exists
});

test('a name that cannot be an id has no id candidate', () => {
  const [l] = parseList('M5 bolts 20 mm');
  assert.equal(l.id, undefined);
  assert.equal(l.text, 'M5 bolts 20 mm');
});

test('missing parts after a dash', () => {
  const [l] = parseList('s0ld3r - tweez1 x1 - wick01');
  assert.equal(l.id, 's0ld3r');
  assert.deepEqual(l.missing, [{ id: 'tweez1', qty: 1 }, { id: 'wick01', qty: 1 }]);
});

test('line numbers survive blank lines', () => {
  const lines = parseList('\n\nabcd\n\nefgh');
  assert.deepEqual(lines.map(l => l.n), [3, 5]);
});
