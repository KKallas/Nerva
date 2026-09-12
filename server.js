require('dotenv').config();
const path = require('path');
const express = require('express');
const { Store } = require('./lib/store');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

const store = new Store(DATA_DIR);
const app = express();
app.disable('x-powered-by');

// shared browser/server modules, served as-is
app.get('/parse.js', (req, res) => res.sendFile(path.join(__dirname, 'lib', 'parse.js')));
app.get('/search.js', (req, res) => res.sendFile(path.join(__dirname, 'lib', 'search.js')));

app.use(require('./routes/items')(store));
app.use(require('./routes/units')(store));
app.use(require('./routes/photos')(store));
app.use(require('./routes/qr')(store));
app.use(require('./routes/settings')(store));
app.use(require('./routes/file')(store));

app.get('/items', (req, res) => res.sendFile(path.join(__dirname, 'public', 'items.html')));
app.get('/i/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'item.html')));
app.use('/photos', express.static(store.dirs.photos, { maxAge: '1h' }));
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Nerva: http://localhost:${PORT}  (${store.items.size} items, data in ${DATA_DIR})`);
});
