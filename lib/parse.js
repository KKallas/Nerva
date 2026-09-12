// The list parser. One line = one entry. Used by the server, the browser and the CLI.
//
//   a7k3q9              id
//   b2x8   x3           id, quantity 3
//   s0ld3r - tweez1 x1  id, with missing parts (used on `in`)
//   Jumper wires 40pc   free text (search on `find`, new item on `new`)
//   # comment
//
// A first token that looks like an id ("jumper") is only a candidate: `id` is set
// AND `text` always holds the whole head. Verbs check the store for `id` first and
// fall back to `text`. The parser never decides what exists.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NervaParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ID_RE = /^[a-z0-9]{4,8}$/i;
  const QTY_RE = /^x(\d+)$/i;

  function parseTokens(tokens) {
    let qty = 1;
    const note = [];
    for (const t of tokens) {
      const m = QTY_RE.exec(t);
      if (m) qty = parseInt(m[1], 10);
      else note.push(t);
    }
    return { qty, note: note.join(' ') };
  }

  function parseLine(raw, n) {
    const text = raw.trim();
    if (!text || text.startsWith('#')) return null;
    const [head, ...missingParts] = text.split(/\s+-\s+/);
    const tokens = head.split(/\s+/);
    const entry = { n, raw, qty: 1, note: '', missing: [] };
    if (ID_RE.test(tokens[0])) entry.id = tokens[0].toLowerCase();
    // "xN" is a quantity wherever it appears; text keeps the other words so
    // "multimeter x2" searches for "multimeter" with qty 2.
    const rest = parseTokens(entry.id ? tokens.slice(1) : tokens);
    entry.qty = rest.qty;
    entry.text = entry.id ? head.trim() : rest.note;
    if (entry.id) entry.note = rest.note;
    for (const part of missingParts) {
      const pt = part.trim().split(/\s+/);
      if (!ID_RE.test(pt[0])) { entry.note = (entry.note + ' - ' + part).trim(); continue; }
      const p = parseTokens(pt.slice(1));
      entry.missing.push({ id: pt[0].toLowerCase(), qty: p.qty });
    }
    return entry;
  }

  function parseList(text) {
    return String(text || '').split(/\r?\n/)
      .map((raw, i) => parseLine(raw, i + 1))
      .filter(Boolean);
  }

  return { parseList, parseLine, ID_RE };
});
