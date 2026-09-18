// A handful of wrong passwords, then a short wait. Shared by the login page
// and HTTP Basic auth so a script cannot guess where the page cannot. Kept in
// memory: a restart forgives, which is fine for a lab.
const TRIES = 8;
const WAIT_MS = 10 * 60 * 1000;
const failures = new Map();

const tooMany = key => { const f = failures.get(key); return !!f && f.n >= TRIES && Date.now() - f.at < WAIT_MS; };

function fail(key) {
  const now = Date.now();
  if (failures.size > 1000) for (const [k, f] of failures) if (now - f.at > WAIT_MS) failures.delete(k);
  const f = failures.get(key);
  failures.set(key, { n: f && now - f.at < WAIT_MS ? f.n + 1 : 1, at: now });
}

const forgive = key => failures.delete(key);

module.exports = { tooMany, fail, forgive, TRIES, WAIT_MS };
