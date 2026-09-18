// Counting. You stand at the shelf, count what is there, and type the number.
// The difference is kept in the log so a drifting count can be traced
// (`was` → `to`; older lines call the first one `from`).
const express = require('express');

module.exports = function countRoutes(store) {
  const router = express.Router();

  router.post('/api/items/:id/count', express.json(), (req, res) => {
    const item = store.items.get(String(req.params.id).toLowerCase());
    if (!item) return res.status(404).json({ error: 'no such item' });
    if (item.tracked) return res.status(400).json({ error: 'this one is numbered: add or retire units instead of counting' });
    const to = Math.round(Number(req.body && req.body.quantity));
    if (!Number.isFinite(to) || to < 0 || to > 1e6) return res.status(400).json({ error: 'give a number of 0 or more' });
    const from = item.quantity ?? 0;
    item.quantity = to;
    store.saveItem(item);
    store.log({ type: 'count', id: item.id, name: item.name, was: from, to, place: item.shelf || undefined, delta: to - from, note: String((req.body && req.body.note) || '').slice(0, 120), who: req.who || null });
    res.json({ ok: true, from, to, delta: to - from, item });
  });

  return router;
};
