// POST /api/file?verb=find   body: text/plain list, or JSON { text }
// Picks verbs/<verb>.js by filename. Adding a verb = adding a file.
// Whatever else is in the query string reaches the verb as its options:
// ?verb=out&due=2026-10-01, ?verb=in&checkout=C00007.
// A verb that sets `module.exports.admin = true` is an admin's to file.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { parseList } = require('../lib/parse');

const VERBS_DIR = path.join(__dirname, '..', 'verbs');

module.exports = function fileRoutes(store) {
  const router = express.Router();
  // A list is a screenful, and `find` needs no login, so its size is capped:
  // matching thousands of lines against the catalogue would stall everyone.
  const MAX_LINES = 200;
  router.post('/api/file', express.text({ limit: '64kb' }), express.json({ limit: '64kb' }), async (req, res) => {
    const verb = String(req.query.verb || '');
    if (!/^[a-z]+$/.test(verb) || !fs.existsSync(path.join(VERBS_DIR, verb + '.js'))) {
      return res.status(400).json({ error: `unknown verb "${verb}"` });
    }
    const text = typeof req.body === 'string' ? req.body : (req.body && req.body.text) || '';
    const lines = parseList(text);
    if (lines.length > MAX_LINES) return res.status(400).json({ error: `at most ${MAX_LINES} lines per list` });
    const who = req.who || null;
    const run = require(path.join(VERBS_DIR, verb + '.js'));
    if (run.admin && !(req.user && req.user.role === 'admin')) {
      return res.status(403).json({ error: `only an admin can file "${verb}"` });
    }
    const { verb: _, ...opts } = req.query;
    try {
      const results = await run(lines, who, store, opts);
      res.json({ verb, lines: results });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'failed: ' + e.message });
    }
  });
  return router;
};
