// Loans. Checking out a list makes one loan per line, all carrying the same
// `checkout` id, the same borrower and the same return date, so "Mari's list
// from Tuesday" stays one thing on screen while each line can come back on
// its own. A loan is open until everything on it is back.
const { splitUnitId } = require('./units');

// Dates are plain local days, "2026-10-01": a return date has no time of day.
const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => day(new Date());

// How many of this loan are still out.
const outstanding = loan => (loan.returnedAt ? 0 : Math.max(0, loan.qty - (loan.returned || 0)));
const isOverdue = loan => !loan.returnedAt && !!loan.dueAt && loan.dueAt < today();
// Whole days past the return date; 0 for anything not late.
const daysLate = loan => (isOverdue(loan) ? Math.round((new Date(today() + 'T12:00:00') - new Date(loan.dueAt + 'T12:00:00')) / 86400000) : 0);
const byDue = (a, b) => String(a.dueAt).localeCompare(String(b.dueAt)) || String(a.borrowedAt).localeCompare(String(b.borrowedAt));

const openLoans = store => [...store.loans.values()].filter(l => !l.returnedAt);
// Open loans on exactly this id: a product, or one numbered unit. Soonest due first.
const loansOn = (store, id) => openLoans(store).filter(l => l.itemId === id).sort(byDue);

// The return date for a new checkout: what was asked for, or today plus the
// lab's loan period. Throws with a status, like everything a route reports.
function dueDate(config, raw) {
  if (!raw) {
    const d = new Date();
    d.setDate(d.getDate() + (Number(config && config.loanDays) || 14));
    return day(d);
  }
  const text = String(raw).slice(0, 10);
  const d = new Date(text + 'T12:00:00');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(d.getTime()) || day(d) !== text) {
    throw Object.assign(new Error('the return date must look like 2026-10-01'), { status: 400 });
  }
  if (text < today()) throw Object.assign(new Error('the return date is in the past'), { status: 400 });
  return text;
}

// "L00042", "C00007": one past the highest in use. `field` is where to look.
function nextId(store, prefix, field) {
  let max = 0;
  for (const l of store.loans.values()) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(l[field] || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return prefix + String(max + 1).padStart(5, '0');
}

// What is out, per product: Map of product id -> [{ id, who, qty, due }],
// where `id` is the product or the numbered unit that is out. Built once per
// catalogue, so a row can say "out until …" without a second request.
function outIndex(store) {
  const index = new Map();
  for (const l of openLoans(store).sort(byDue)) {
    const parts = splitUnitId(l.itemId);
    const base = parts ? parts.baseId : l.itemId;
    if (!index.has(base)) index.set(base, []);
    index.get(base).push({ id: l.itemId, who: l.who, qty: outstanding(l), due: l.dueAt });
  }
  return index;
}

// One line for a person: "out with mari until 2026-10-01" for a numbered one,
// "3 out, first back 2026-10-01" for a quantity. Empty when nothing is out.
function outNote(out, unitN) {
  const mine = unitN ? (out || []).filter(o => o.id.endsWith('-' + unitN)) : (out || []);
  if (!mine.length) return '';
  if (unitN) return `out with ${mine[0].who} until ${mine[0].due}`;
  const n = mine.reduce((sum, o) => sum + o.qty, 0);
  return `${n} out, ${mine.length > 1 ? 'first ' : ''}back ${mine[0].due}`;
}

module.exports = { today, outstanding, isOverdue, daysLate, byDue, openLoans, loansOn, dueDate, nextId, outIndex, outNote };
