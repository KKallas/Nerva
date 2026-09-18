// find: where is it, how many. Never writes.
// An exact id → one ok line. Text (or an id-looking word that does not exist)
// → up to 5 `matches` the user can pick from to swap the line for an exact id.
const { search } = require('../lib/search');
const { quantityOf, unitId } = require('../lib/units');
const { outNote } = require('../lib/loans');

function brief(item) {
  return { id: item.id, name: item.name, quantity: quantityOf(item), location: item.location || '', kind: item.kind || 'item', tracked: !!item.tracked };
}
// `out` is the catalogue's list of what is on loan for this product, so the
// answer to "is there any" includes "and when is it back".
function describe(item, unit, out) {
  const what = unit ? `${item.name} #${unit.n}` : item.name;
  const many = unit ? 'this one' : `${quantityOf(item)}`;
  const away = outNote(out, unit && unit.n);
  return `${what} · ${many} · ${item.location || 'no location set'}${away ? ' · ' + away : ''}`;
}

module.exports = async function find(lines, who, store) {
  const catalogue = store.catalogue();
  const outOf = id => (catalogue.find(c => c.id === id) || {}).out;
  return lines.map(line => {
    const found = line.id && store.resolve(line.id);
    if (found) {
      const { item, unit } = found;
      const b = brief(item);
      if (unit) { b.id = unitId(item.id, unit.n); b.name = `${item.name} #${unit.n}`; b.quantity = 1; }
      return { n: line.n, line: line.raw, ok: true, message: describe(item, unit, outOf(item.id)), item: b };
    }
    // forgiving: "multimeter for the demo" → try dropping trailing words until something matches
    const words = line.text.split(/\s+/).filter(Boolean);
    let matches = [];
    for (let k = words.length; k > 0 && !matches.length; k--) matches = search(catalogue, words.slice(0, k).join(' '), 5).map(brief);
    if (!matches.length) return { n: line.n, line: line.raw, ok: false, message: 'not found' };
    return {
      n: line.n, line: line.raw, ok: true,
      message: matches.length === 1 ? describe(matches[0], null, outOf(matches[0].id)) : `${matches.length} matches, pick one:`,
      matches,
    };
  });
};
