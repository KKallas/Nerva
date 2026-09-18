// The state of the lab on one screen: what is late and by how much, who still
// has things, and which places they are missing from. Nothing here is stored;
// it is the open loans, counted three ways.
const { splitUnitId, placeOf } = require('./units');
const { findByUsername } = require('./users');
const { openLoans, outstanding, daysLate, byDue } = require('./loans');

// Rows of [key, loan] gathered under their key, each group summed the same way.
function tally(rows, more) {
  const groups = new Map();
  for (const [key, loan] of rows) {
    if (!groups.has(key)) groups.set(key, { things: 0, late: 0, worst: 0, nextDue: loan.dueAt, loans: [] });
    const g = groups.get(key);
    g.things += loan.outstanding;
    if (loan.daysLate) g.late += loan.outstanding;
    g.worst = Math.max(g.worst, loan.daysLate);
    if (loan.dueAt < g.nextDue) g.nextDue = loan.dueAt;
    g.loans.push(loan);
  }
  return [...groups.entries()].map(([key, g]) => ({ ...more(key, g), ...g }))
    .sort((a, b) => b.worst - a.worst || String(a.nextDue).localeCompare(String(b.nextDue)));
}

function overview(store) {
  const loans = openLoans(store).sort(byDue).map(l => {
    const found = store.resolve(l.itemId);
    const person = findByUsername(store, l.who);
    // where it belongs: written on the loan when it was taken, else where the item lives now
    const place = l.place || (found && placeOf(found.item, found.unit).shelf) || null;
    return {
      id: l.id, checkout: l.checkout, itemId: l.itemId, who: l.who, dueAt: l.dueAt, borrowedAt: l.borrowedAt,
      name: found ? found.item.name + (found.unit ? ` #${found.unit.n}` : '') : l.itemId,
      whoName: person ? person.name : l.who,
      outstanding: outstanding(l), partly: !!l.returned, daysLate: daysLate(l),
      place, placeName: store.placeText(place) || '',
    };
  });
  const base = id => (splitUnitId(id) || { baseId: id }).baseId;
  return {
    totals: { loans: loans.length, things: loans.reduce((n, l) => n + l.outstanding, 0), late: loans.filter(l => l.daysLate).length,
      people: new Set(loans.map(l => l.who)).size },
    late: loans.filter(l => l.daysLate).sort((a, b) => b.daysLate - a.daysLate),
    people: tally(loans.map(l => [l.who, l]), (who, g) => ({ who, whoName: g.loans[0].whoName })),
    items: tally(loans.map(l => [base(l.itemId), l]), (id, g) => ({ id, name: (store.items.get(id) || {}).name || id })),
    places: tally(loans.filter(l => l.place).map(l => [l.place, l]), (place, g) => ({ place, placeName: g.loans[0].placeName || place })),
  };
}

module.exports = { overview };
