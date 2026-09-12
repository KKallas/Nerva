// count: "the shelf actually has this many". One line per item, quantity after
// an x. Numbered products are not counted; their units are added or retired.
const { search } = require('../lib/search');

module.exports = async function count(lines, who, store) {
  const catalogue = store.catalogue();
  return lines.map(line => {
    const found = line.id && store.resolve(line.id);
    if (!found) {
      const matches = search(catalogue, line.text, 5);
      return { n: line.n, line: line.raw, ok: false,
        message: matches.length ? 'which one? add the id' : 'not found',
        matches: matches.map(m => ({ id: m.id, name: m.name, quantity: m.quantity, location: m.location, kind: m.kind })) };
    }
    const { item, unit } = found;
    if (unit) return { n: line.n, line: line.raw, ok: false, message: `${item.name} #${unit.n} is one numbered object, not a quantity` };
    if (item.tracked) return { n: line.n, line: line.raw, ok: false, message: `${item.name} is numbered: add or retire units instead` };
    const from = item.quantity ?? 0;
    const to = line.qty;
    item.quantity = to;
    store.saveItem(item);
    store.log({ type: 'count', id: item.id, from, to, delta: to - from, who: who ? who.email : null });
    return { n: line.n, line: line.raw, ok: true,
      message: `${item.name} · ${from} → ${to}${to === from ? ' (no change)' : ''}`,
      item: { id: item.id, name: item.name, quantity: to, location: item.location || '', kind: item.kind || 'item' } };
  });
};
