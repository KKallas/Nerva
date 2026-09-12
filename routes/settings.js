// Settings: the few knobs worth having, plus how to reach this instance
// from a phone right now.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { DEFAULT_CONFIG } = require('../lib/store');
const { lanUrl } = require('../lib/net');

const FIELDS = {
  labName:  v => String(v).trim().slice(0, 60) || DEFAULT_CONFIG.labName,
  lowStock: v => Math.max(0, Math.min(999, Math.round(Number(v) || 0))),
  loanDays: v => Math.max(1, Math.min(365, Math.round(Number(v) || DEFAULT_CONFIG.loanDays))),
};

function dirBytes(dir) {
  try { return fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0); }
  catch { return 0; }
}

module.exports = function settingsRoutes(store) {
  const router = express.Router();

  router.get('/api/settings', (req, res) => {
    const items = [...store.items.values()];
    res.json({
      config: store.config,
      runtime: store.runtime,                       // { publicUrl, startedAt } while a tunnel is up
      baseUrlEnv: process.env.BASE_URL || null,
      lanUrl: lanUrl(process.env.PORT || 3000),     // reachable from a phone on the same Wi-Fi
      status: {
        items: items.length,
        sets: items.filter(i => i.kind === 'set').length,
        photos: fs.existsSync(store.dirs.photos) ? fs.readdirSync(store.dirs.photos).length : 0,
        photoBytes: dirBytes(store.dirs.photos),
        openLoans: [...store.loans.values()].filter(l => !l.returnedAt).length,
        dataDir: store.dir,
        node: process.version,
        uptimeSeconds: Math.round(process.uptime()),
      },
    });
  });

  router.put('/api/settings', express.json(), (req, res) => {
    const patch = {};
    for (const [k, clean] of Object.entries(FIELDS)) {
      if (req.body && req.body[k] !== undefined) patch[k] = clean(req.body[k]);
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing to change' });
    store.saveConfig(patch);
    store.log({ type: 'settings', patch, who: req.who || null });
    res.json({ ok: true, config: store.config });
  });

  router.get('/settings', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'settings.html')));

  return router;
};
