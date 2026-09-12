// The list parser. One line = one entry. Used by the server, the browser and the CLI.
//
//   [a7k3q9] Multimeter       id in brackets, then the name so the list reads
//   [b2x8] Jumper wires x3    the same way, with a quantity
//   [s0ld3r-2] Soldering set #2 - tweez1 x1   one numbered set, a part missing
//   a7k3q9                    a bare id still works, for typing or scanning
//   Jumper wires 40pc         free text (search on `find`, new item on `new`)
//   # comment
//
// The brackets matter: everything inside them is the identity, everything after
// is for the human reading the list, and can be edited or lost without changing
// what the line means.
//
// A first token that looks like an id ("jumper") is only a candidate: `id` is set
// AND `text` always holds the whole head. Verbs check the store for `id` first and
// fall back to `text`. The parser never decides what exists.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NervaParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // an id, optionally naming one unit of it: "b2x8" or "b2x8-3"
  const ID_RE = /^[a-z0-9]{4,8}(?:-\d{1,4})?$/i;
  // the same id in brackets at the start of a line, with the name after it
  const BRACKET_RE = /^\[\s*([a-z0-9]{4,8}(?:-\d{1,4})?)\s*\]\s*/i;
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
    const bracketed = BRACKET_RE.exec(head);
    let words;
    if (bracketed) {
      entry.id = bracketed[1].toLowerCase();
      words = head.slice(bracketed[0].length).split(/\s+/).filter(Boolean);
    } else {
      words = tokens;
      if (ID_RE.test(words[0])) { entry.id = words[0].toLowerCase(); words = words.slice(1); }
    }
    // "xN" is a quantity wherever it appears; the rest is words for the reader
    const rest = parseTokens(words);
    entry.qty = rest.qty;
    entry.note = entry.id ? rest.note : '';
    // what to search for if the id turns out not to exist: the name written on
    // a bracketed line, or the whole line when it was never an id to begin with
    entry.text = bracketed ? rest.note : entry.id ? head.trim() : rest.note;
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

  // How a line is written when the app adds one: identity first, then the name.
  const formatLine = (id, name, qty) =>
    (`[${id}]` + (name ? ' ' + String(name).replace(/[\[\]]/g, '').trim() : '') + (qty > 1 ? ' x' + qty : '')).trim();

  return { parseList, parseLine, formatLine, ID_RE, BRACKET_RE };
});
