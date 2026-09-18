#!/usr/bin/env node
// `npm run phone` – run Nerva and put it on your phone.
//
// Prints a QR for the Wi-Fi address straight away, so a phone on the same
// network can start immediately. In parallel it asks Cloudflare for a quick
// tunnel; if one comes up you also get a public HTTPS address, which is what
// you need off the lab network and for the camera later. The public address is
// written to data/runtime.json so QR labels point at it, and cleared on exit.
require('dotenv').config();
const path = require('path');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const { Store } = require('../lib/store');
const { lanUrl } = require('../lib/net');
const net = require('net');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const store = new Store(process.env.DATA_DIR || path.join(ROOT, 'data'));
// A quick tunnel is always several hyphenated words; cloudflared also logs its
// own api.trycloudflare.com endpoint, which must not be mistaken for the tunnel.
const URL_RE = /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com/;

const qr = async url => QRCode.toString(url, { type: 'terminal', small: true, errorCorrectionLevel: 'L' });

// Fail early and clearly instead of letting the child die with EADDRINUSE.
const probe = net.connect(PORT, '127.0.0.1');
probe.on('connect', () => {
  console.error(`\n  Port ${PORT} is already in use. Stop the other "npm start" first,\n  or run this on another port:  PORT=3001 npm run phone\n`);
  probe.destroy();
  process.exit(1);
});
probe.on('error', () => start());   // nothing listening: good

function start() {
  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], { stdio: 'inherit', env: process.env });
  const tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  running = { server, tunnel };
  wire(server, tunnel);
  banner();
}

let running = {};

async function banner() {
  await new Promise(r => setTimeout(r, 600));
  const lan = lanUrl(PORT);
  if (lan) {
    console.log(`\n${await qr(lan)}`);
    console.log(`  On the same Wi-Fi:  ${lan}`);
    console.log(`  Scan the square with your phone camera. Settings: ${lan}/settings\n`);
  } else {
    console.log('\n  No Wi-Fi address found; this machine is only reachable at http://localhost:' + PORT + '\n');
  }
  console.log('  Asking Cloudflare for a public address…\n');
}

let announced = false;
let giveUp = null;

function wire(server, tunnel) {
  const watch = chunk => {
    const m = !announced && URL_RE.exec(chunk.toString());
    if (m) { announced = true; clearTimeout(giveUp); announce(m[0]); }
  };
  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);
  giveUp = setTimeout(() => { if (!announced) console.error('  Still no public address after 40s. The Wi-Fi address above keeps working.\n'); }, 40000);

  tunnel.on('exit', code => {
    clearTimeout(giveUp);
    if (!announced) {
      console.error(`\n  Cloudflare tunnel unavailable (cloudflared exited ${code}).`);
      console.error('  Common causes: no cloudflared (brew install cloudflared), or a network that');
      console.error('  blocks api.trycloudflare.com. The Wi-Fi address above still works.\n');
    } else stop();
  });
  server.on('exit', () => stop());
}

async function announce(url) {
  store.setRuntime({ publicUrl: url, startedAt: new Date().toISOString() });
  console.log(`\n${await qr(url)}`);
  console.log(`  Public address:  ${url}`);
  console.log(`  Works anywhere, over HTTPS. Settings: ${url}/settings`);
  console.log('\n  Anyone who has this address can look things up; changes need a login. It dies on Ctrl-C,');
  console.log('  and the next run gets a different one, so do not print labels from it yet.\n');
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => stop());

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  store.setRuntime({});                 // labels stop pointing at a dead address
  for (const p of [running.server, running.tunnel]) { try { p && p.kill(); } catch {} }
  setTimeout(() => process.exit(0), 150);
}
