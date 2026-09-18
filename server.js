require('dotenv').config();
const path = require('path');
const express = require('express');
const { Store } = require('./lib/store');
const who = require('./lib/who');
const { ensureAdmin } = require('./lib/users');
const { lanUrl } = require('./lib/net');

const PORT = process.env.PORT || 3000;
// HOST=127.0.0.1 behind a reverse proxy; unset, phones on the Wi-Fi can reach it
const HOST = process.env.HOST || undefined;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const store = new Store(DATA_DIR);
const admin = ensureAdmin(store);
const app = express();
app.disable('x-powered-by');
// behind Caddy on the same machine, req.ip and req.protocol come from its headers
app.set('trust proxy', 'loopback');

// shared browser/server modules, served as-is
app.get('/parse.js', (req, res) => res.sendFile(path.join(__dirname, 'lib', 'parse.js')));
app.get('/search.js', (req, res) => res.sendFile(path.join(__dirname, 'lib', 'search.js')));
// the QR reader for browsers without BarcodeDetector, fetched by scan.js only then
app.get('/jsqr.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules', 'jsqr', 'dist', 'jsQR.js'), { maxAge: '1d' }));

// who is asking, for every request; writes need someone
app.use(who.identify(store));
app.use('/api', who.guardWrites);

app.use(require('./routes/login')(store));
app.use(require('./routes/users')(store));
app.use(require('./routes/items')(store));
app.use(require('./routes/units')(store));
app.use(require('./routes/count')(store));
app.use(require('./routes/locations')(store));
app.use(require('./routes/photos')(store));
app.use(require('./routes/qr')(store));
app.use(require('./routes/settings')(store));
app.use(require('./routes/file')(store));
app.use(require('./routes/loans')(store));
app.use(require('./routes/history')(store));

app.get('/items', (req, res) => res.sendFile(path.join(__dirname, 'public', 'items.html')));
app.get('/i/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'item.html')));
app.get('/help', (req, res) => res.sendFile(path.join(__dirname, 'public', 'help.html')));
app.use('/photos', express.static(store.dirs.photos, { maxAge: '1h' }));
app.use(express.static(path.join(__dirname, 'public')));

// Errors answer in JSON, as Nerva.api expects, and never with a stack trace.
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'failed' });
});

app.listen(PORT, HOST, () => {
  console.log(`Nerva: http://localhost:${PORT}  (${store.items.size} items, data in ${DATA_DIR})`);
  // Until the built-in admin has a password, the only way in is this link,
  // shown to whoever started the server.
  if (!store.users.get(admin.id).password) {
    const base = lanUrl(PORT) || `http://localhost:${PORT}`;
    console.log(`\n  Set the "${admin.username}" password: ${base}/login?card=${admin.card}\n  (shown until it is set; lost it later? npm run reset-admin)\n`);
  }
});
