// Shared browser helpers: the cached catalogue, the list, escaping, nav.
window.Nerva = (function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // --- catalogue: serve the cache immediately, refresh from the server behind it ---
  let catalogue = [];
  try { catalogue = JSON.parse(get('nerva.catalogue') || '[]'); } catch {}
  function loadCatalogue(onReady) {
    if (catalogue.length) onReady(catalogue, 'cached');
    return fetch('/api/catalogue.json').then(r => r.json()).then(d => {
      catalogue = d.items;
      set('nerva.catalogue', JSON.stringify(catalogue));
      onReady(catalogue, 'fresh');
      return catalogue;
    }).catch(() => { onReady(catalogue, catalogue.length ? 'offline' : 'empty'); });
  }

  // --- the list, shared between pages ---
  const listText = () => get('nerva.list') || '';
  const setList = t => { set('nerva.list', t); window.dispatchEvent(new Event('nerva:list')); };
  const addLine = line => setList((listText().trimEnd() ? listText().trimEnd() + '\n' : '') + line + '\n');
  const listCount = () => (window.NervaParse ? NervaParse.parseList(listText()).length : 0);

  // --- nav, same on every page ---
  function nav(current) {
    const tabs = [['/', 'Checkout'], ['/items', 'Items'], ['/locations', 'Locations', 'soon']];
    document.body.insertAdjacentHTML('afterbegin', `<nav class="tabs">${tabs.map(([href, label, soon]) =>
      `<a href="${href}"${href === current ? ' aria-current="page"' : ''}${soon ? ' class="soon" title="coming later"' : ''}>${label}${
        href === '/' && listCount() ? ` <span class="tag">${listCount()}</span>` : ''}</a>`).join('')}<span class="grow"></span><span class="status" id="navstatus"></span></nav>`);
  }
  const status = t => { const el = document.getElementById('navstatus'); if (el) el.textContent = t; };

  // opts.hideLocation: the location is already the group heading, do not repeat it.
  function itemRow(i, opts) {
    const o = opts || {};
    const qty = `<span class="qty">${i.quantity}</span>${o.hideLocation ? ' in stock' : ''}`;
    const bits = [o.hideLocation ? '' : (esc(i.location) || '<i>no location</i>'), qty, o.extra]
      .filter(Boolean).join(' · ');
    return `<a class="row" href="/i/${i.id}">
      ${i.locationPhoto ? `<img class="thumb" src="/photos/${i.id}-loc.jpg" alt="" loading="lazy">` : '<div class="thumb"></div>'}
      <div class="main">
        <div class="name">${esc(i.name)}${i.kind === 'set' ? ' <span class="tag">set</span>' : ''}</div>
        <div class="where">${bits}</div>
      </div>
      <button class="add" data-id="${i.id}" title="add to list" aria-label="add to list">+</button>
    </a>`;
  }

  // one place that turns a "+" click into a list line
  function wireAdd(container) {
    container.addEventListener('click', e => {
      const b = e.target.closest('.add'); if (!b) return;
      e.preventDefault();
      addLine(b.dataset.id);
      b.textContent = '✓'; setTimeout(() => { b.textContent = '+'; }, 700);
    });
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  return { esc, loadCatalogue, get catalogue() { return catalogue; }, listText, setList, addLine, listCount, nav, status, itemRow, wireAdd };
})();
