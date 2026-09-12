// POST /api/file?verb=find   body: text/plain list, or JSON { text }
// Picks verbs/<verb>.js by filename. Adding a verb = adding a file.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { parseList } = require('../lib/parse');

const VERBS_DIR = path.join(__dirname, '..', 'verbs');

module.exports = function fileRoutes(store) {
  const router = express.Router();
  router.post('/api/file', express.text({ limit: '1mb' }), express.json({ limit: '1mb' }), async (req, res) => {
    const verb = String(req.query.verb || '');
    if (!/^[a-z]+$/.test(verb) || !fs.existsSync(path.join(VERBS_DIR, verb + '.js'))) {
      return res.status(400).json({ error: `unknown verb "${verb}"` });
    }
    const text = typeof req.body === 'string' ? req.body : (req.body && req.body.text) || '';
    const lines = parseList(text);
    const who = req.who || null; // identity arrives in build step 3
    try {
      const results = await require(path.join(VERBS_DIR, verb + '.js'))(lines, who, store);
      res.json({ verb, lines: results });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error(e);
      res.status(500).json({ error: 'failed: ' + e.message });
    }
  });
  return router;
};
