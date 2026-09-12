// Forgiving search over catalogue rows. Every word typed must appear somewhere
// in id, name, description, tags or location. Shared by browser and server.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NervaSearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function haystack(item) {
    return [item.id, item.name, item.description, (item.tags || []).join(' '), item.location]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function search(items, q, limit) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const item of items) {
      const h = haystack(item);
      if (!words.every(w => h.includes(w))) continue;
      const name = (item.name || '').toLowerCase();
      // rank: name starts with query > name contains all words > rest
      const score = name.startsWith(words[0]) ? 0 : words.every(w => name.includes(w)) ? 1 : 2;
      out.push({ item, score });
    }
    out.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name));
    return out.slice(0, limit || 50).map(o => o.item);
  }

  return { search, haystack };
});
