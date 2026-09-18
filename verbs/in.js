// in: "these are back". Checking in is the admin's job: someone looks at what
// came back before it counts as returned. The route enforces that through
// `admin` below; the verb itself only needs to know who is filing.
//
// A line closes the loans on that id, soonest due first, until its quantity
// is used up. opts.checkout narrows it to one checkout, which is how the
// Loans page checks in a single line of a single list.
const { search } = require('../lib/search');
const { unitId, placeOf } = require('../lib/units');
const { loansOn, outstanding } = require('../lib/loans');

module.exports = async function checkIn(lines, who, store, opts) {
  if (!who) throw Object.assign(new Error('log in first'), { status: 401 });
  const only = opts && opts.checkout ? String(opts.checkout).toUpperCase() : null;
  const catalogue = store.catalogue();

  return lines.map(line => {
    const bad = (message, matches) => ({ n: line.n, line: line.raw, ok: false, message, matches });
    const found = line.id && store.resolve(line.id);
    if (!found) {
      const matches = search(catalogue, line.text, 5);
      return bad(matches.length ? 'which one? pick it' : 'not found', matches.length
        ? matches.map(m => ({ id: m.id, name: m.name, quantity: m.quantity, location: m.location, kind: m.kind })) : undefined);
    }
    const { item, unit } = found;
    const id = unit ? unitId(item.id, unit.n) : item.id;
    const name = unit ? `${item.name} #${unit.n}` : item.name;
    const loans = loansOn(store, id).filter(l => !only || l.checkout === only);

    if (!loans.length) {
      // a numbered product scanned without its number: offer the ones that are out
      const away = item.tracked && !unit
        ? (item.units || []).filter(u => loansOn(store, unitId(item.id, u.n)).some(l => !only || l.checkout === only)) : [];
      if (away.length) return bad(`${item.name} is numbered: which one came back?`,
        away.map(u => ({ id: unitId(item.id, u.n), name: `${item.name} #${u.n}`, quantity: 1, location: item.location || '', kind: item.kind || 'item' })));
      return bad(`${name} is not out${only ? ' on ' + only : ''}`);
    }

    let remaining = unit ? 1 : line.qty;
    if (!(remaining >= 1)) return bad('bring back at least one');
    const now = new Date().toISOString();
    const from = [];
    let back = 0;
    for (const loan of loans) {
      if (!remaining) break;
      const n = Math.min(remaining, outstanding(loan));
      loan.returned = (loan.returned || 0) + n;
      if (loan.returned >= loan.qty) { loan.returnedAt = now; loan.returnedTo = who; }
      store.saveLoan(loan);
      store.log({ type: 'in', id, name, qty: n, loan: loan.id, checkout: loan.checkout, due: loan.dueAt, from: loan.who, place: placeOf(item, unit).shelf || undefined, who });
      remaining -= n; back += n;
      if (!from.includes(loan.who)) from.push(loan.who);
    }
    // a quantity goes back on the shelf; a numbered one was never subtracted
    if (!unit && !item.tracked) { item.quantity = (item.quantity ?? 0) + back; store.saveItem(item); }
    const still = loansOn(store, id).reduce((sum, l) => sum + outstanding(l), 0);
    return { n: line.n, line: line.raw, ok: true,
      message: `${name}${unit ? '' : ' x' + back} · back from ${from.join(', ')}`
        + (remaining ? ` (only ${back} were out)` : '') + (still ? ` · ${still} still out` : ''),
      item: { id, name, quantity: unit ? 1 : item.quantity ?? 0, location: item.location || '', kind: item.kind || 'item' } };
  });
};

module.exports.admin = true;
