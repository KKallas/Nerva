// out: "I am taking these". The whole list becomes one checkout under your
// name with one return date (opts.due, or today plus the lab's loan period).
// Each good line is a loan of its own, so it can come back on its own.
// Things that get used up (bolts, glue, tape) leave the shelf and make no loan:
// nobody is waiting for them.
const { search } = require('../lib/search');
const { unitId, placeOf } = require('../lib/units');
const { dueDate, nextId, loansOn, outIndex, outNote } = require('../lib/loans');

module.exports = async function out(lines, who, store, opts) {
  if (!who) throw Object.assign(new Error('log in first'), { status: 401 });
  const due = dueDate(store.config, opts && opts.due);
  const catalogue = store.catalogue();
  let checkout = null;   // numbered only once a line really makes a loan

  return lines.map(line => {
    const bad = (message, matches) => ({ n: line.n, line: line.raw, ok: false, message, matches });
    const brief = (item, id, name, quantity, location) => ({ id, name, quantity, location: location || '', kind: item.kind || 'item' });
    const found = line.id && store.resolve(line.id);
    if (!found) {
      const matches = search(catalogue, line.text, 5);
      return bad(matches.length ? 'which one? pick it' : 'not found',
        matches.length ? matches.map(m => brief(m, m.id, m.name, m.quantity, m.location)) : undefined);
    }
    const { item, unit } = found;

    // A numbered product: say which one. Offer the ones still on the shelf.
    if (item.tracked && !unit) {
      const free = (item.units || []).filter(u => !loansOn(store, unitId(item.id, u.n)).length);
      if (!free.length) return bad(`${item.name}: all of them are out. ${outNote(outIndex(store).get(item.id))}`);
      return bad(`${item.name} is numbered: which one are you taking?`,
        free.slice(0, 8).map(u => brief(item, unitId(item.id, u.n), `${item.name} #${u.n}`, 1, placeOf(item, u).location)));
    }

    const id = unit ? unitId(item.id, unit.n) : item.id;
    const name = unit ? `${item.name} #${unit.n}` : item.name;
    if (unit) {
      const [taken] = loansOn(store, id);
      if (taken) return bad(`${name} is out with ${taken.who} until ${taken.dueAt}`);
    }
    const qty = unit ? 1 : line.qty;
    if (!(qty >= 1 && qty <= 1e6)) return bad('take at least one');

    // A quantity leaves the shelf. If the shelf said fewer, the count was
    // wrong, not the person: take them anyway and say so.
    let left = 1, short = '';
    if (!unit) {
      const from = item.quantity ?? 0;
      left = Math.max(0, from - qty);
      if (qty > from) short = ` (the shelf said ${from})`;
      item.quantity = left;
      store.saveItem(item);
    }
    const place = placeOf(item, unit).shelf || undefined;   // where it was taken from, for the place's log
    const result = { n: line.n, line: line.raw, ok: true, item: brief(item, id, name, unit ? 1 : left, placeOf(item, unit).location) };

    if (item.consumable && !unit) {
      store.log({ type: 'used', id, name, qty, left, place, who });
      return { ...result, message: `${name} x${qty} · not expected back · ${left} left${short}` };
    }

    checkout = checkout || nextId(store, 'C', 'checkout');
    const loan = store.saveLoan({
      id: nextId(store, 'L', 'id'), checkout, itemId: id, qty, returned: 0, who,
      borrowedAt: new Date().toISOString(), dueAt: due, returnedAt: null, place,
    });
    store.log({ type: 'out', id, name, qty, loan: loan.id, checkout, due, place, who });
    return { ...result, loan: loan.id, checkout, due,
      message: `${name}${unit ? '' : ' x' + qty} · yours until ${due}${unit ? '' : ` · ${left} left${short}`}` };
  });
};
