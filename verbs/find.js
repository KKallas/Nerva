// find: where is it, how many. Never writes.
const { search } = require('../lib/search');

function describe(item) {
  const where = item.location || 'no location set';
  return `${item.name} · ${item.quantity ?? 0} · ${where}`;
}

module.exports = async function find(lines, who, store) {
  const catalogue = store.catalogue();
  return lines.map(line => {
    if (line.id && store.items.has(line.id)) {
      const item = store.items.get(line.id);
      return { n: line.n, line: line.raw, ok: true, message: describe(item), item: item.id };
    }
    const q = line.text;
    const matches = search(catalogue, q, 3);
    if (!matches.length) return { n: line.n, line: line.raw, ok: false, message: 'not found' };
    return {
      n: line.n, line: line.raw, ok: true,
      message: matches.map(m => `${m.id}  ${describe(m)}`).join('\n'),
      matches: matches.map(m => m.id),
    };
  });
};
