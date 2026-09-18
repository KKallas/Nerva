#!/usr/bin/env node
// `npm run reset-admin` – the built-in admin forgot their password.
// Clears it, gives the admin a fresh card, and prints the link that sets a new
// password. Run it with Nerva stopped: the server keeps users in memory and
// would write the old password back.
require('dotenv').config();
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { Store } = require('../lib/store');
const { ensureAdmin } = require('../lib/users');
const { lanUrl } = require('../lib/net');

const PORT = process.env.PORT || 3000;

const probe = net.connect(PORT, '127.0.0.1');
probe.on('connect', () => {
  console.error(`\n  Nerva is running on port ${PORT}. Stop it first, then run this again.\n`);
  probe.destroy();
  process.exit(1);
});
probe.on('error', async () => {
  const store = new Store(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const admin = ensureAdmin(store);
  admin.password = null;
  admin.card = crypto.randomUUID();
  admin.session = (admin.session || 1) + 1;
  store.saveUser(admin);
  store.log({ type: 'user-reset', user: admin.username, who: 'reset-admin' });
  const link = `${process.env.BASE_URL || lanUrl(PORT) || `http://localhost:${PORT}`}/login?card=${admin.card}`;
  console.log(`\n${await QRCode.toString(link, { type: 'terminal', small: true, errorCorrectionLevel: 'L' })}`);
  console.log(`  "${admin.username}" has no password now. Start Nerva, then open:\n  ${link}\n`);
});
