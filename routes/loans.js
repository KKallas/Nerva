// Who has what, and when it is due back. Reading is open to everyone, like
// the rest of the catalogue: "soldering set 3 is with Mari until Friday"
// answers the question before it is asked. Checking in is `POST /api/file
// ?verb=in`, the same list format as everything else, not a route here.
const path = require('path');
const express = require('express');
const { findByUsername } = require('../lib/users');
const { outstanding, isOverdue, byDue, dueDate } = require('../lib/loans');

module.exports = function loanRoutes(store) {
  const router = express.Router();

  // A loan as the page wants it: with the name of the thing and of the person.
  function describe(loan) {
    const found = store.resolve(loan.itemId);
    const person = findByUsername(store, loan.who);
    return {
      ...loan,
      name: found ? found.item.name + (found.unit ? ` #${found.unit.n}` : '') : loan.itemId,
      whoName: person ? person.name : loan.who,
      outstanding: outstanding(loan), overdue: isOverdue(loan),
    };
  }

  // ?open=1 only what is still out, ?mine=1 only the caller's. Soonest due first.
  router.get('/api/loans', (req, res) => {
    let loans = [...store.loans.values()];
    if (req.query.open) loans = loans.filter(l => !l.returnedAt);
    if (req.query.mine) loans = loans.filter(l => req.who && l.who === req.who);
    res.json(loans.sort(byDue).map(describe));
  });

  // Moving the return date of a whole checkout: yours, or anyone's for an admin.
  router.put('/api/checkouts/:id/due', express.json(), (req, res) => {
    const id = String(req.params.id).toUpperCase();
    const loans = [...store.loans.values()].filter(l => l.checkout === id && !l.returnedAt);
    if (!loans.length) return res.status(404).json({ error: 'nothing is out on that checkout' });
    if (req.user.role !== 'admin' && loans.some(l => l.who !== req.who)) {
      return res.status(403).json({ error: 'that checkout is someone else\'s' });
    }
    if (!(req.body && req.body.due)) return res.status(400).json({ error: 'give a return date' });
    let due;
    try { due = dueDate(store.config, req.body && req.body.due); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
    for (const loan of loans) { loan.dueAt = due; store.saveLoan(loan); }
    store.log({ type: 'due', id, due, who: req.who });
    res.json({ ok: true, due, loans: loans.map(describe) });
  });

  router.get('/loans', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'loans.html')));
  return router;
};
