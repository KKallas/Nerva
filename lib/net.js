// Which addresses this machine can be reached on.
const os = require('os');

// The Wi-Fi / LAN address a phone on the same network can open. Prefers
// ordinary private ranges over link-local and virtual interfaces.
function lanAddress() {
  const rank = ip => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^169\.254\./.test(a.address)) continue;                 // link-local
      if (/^(vnic|bridge|utun|llw|awdl|docker)/i.test(name)) continue; // virtual
      found.push(a.address);
    }
  }
  return found.sort((a, b) => rank(a) - rank(b))[0] || null;
}

const lanUrl = port => { const ip = lanAddress(); return ip ? `http://${ip}:${port}` : null; };

module.exports = { lanAddress, lanUrl };
