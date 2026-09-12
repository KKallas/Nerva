// find: where is it, how many. Never writes.
// An exact id → one ok line. Text (or an id-looking word that does not exist)
// → up to 5 `matches` the user can pick from to swap the line for an exact id.
const { search } = require('../lib/search');

function brief(item) {
  return { id: item.id, name: item.name, quantity: item.quantity ?? 0, location: item.location || '', kind: item.kind || 'item' };
}
function describe(item) {
  return `${item.name} · ${item.quantity ?? 0} · ${item.location || 'no location set'}`;
}

module.exports = async function find(lines, who, store) {
  const catalogue = store.catalogue();
  return lines.map(line => {
    if (line.id && store.items.has(line.id)) {
      const item = store.items.get(line.id);
      return { n: line.n, line: line.raw, ok: true, message: describe(item), item: brief(item) };
    }
    // forgiving: "multimeter for the demo" → try dropping trailing words until something matches
    const words = line.text.split(/\s+/).filter(Boolean);
    let matches = [];
    for (let k = words.length; k > 0 && !matches.length; k--) matches = search(catalogue, words.slice(0, k).join(' '), 5).map(brief);
    if (!matches.length) return { n: line.n, line: line.raw, ok: false, message: 'not found' };
    return {
      n: line.n, line: line.raw, ok: true,
      message: matches.length === 1 ? describe(matches[0]) : `${matches.length} matches, pick one:`,
      matches,
    };
  });
};
