// Shared browser helpers: the cached catalogue, the list, escaping, nav.
window.Nerva = (function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // --- catalogue: serve the cache immediately, refresh from the server behind it ---
  let catalogue = [];
  let config = { labName: 'Robotics lab', lowStock: 2, loanDays: 14 };
  try { catalogue = JSON.parse(get('nerva.catalogue') || '[]'); } catch {}
  try { config = { ...config, ...JSON.parse(get('nerva.config') || '{}') }; } catch {}
  function loadCatalogue(onReady) {
    if (catalogue.length) onReady(catalogue, 'cached');
    return fetch('/api/catalogue.json').then(r => r.json()).then(d => {
      catalogue = d.items;
      set('nerva.catalogue', JSON.stringify(catalogue));
      if (d.config) { config = d.config; set('nerva.config', JSON.stringify(config)); }
      onReady(catalogue, 'fresh');
      return catalogue;
    }).catch(() => { onReady(catalogue, catalogue.length ? 'offline' : 'empty'); });
  }

  // --- the list, shared between pages ---
  const listText = () => get('nerva.list') || '';
  const setList = t => { set('nerva.list', t); window.dispatchEvent(new Event('nerva:list')); };
  const append = line => setList((listText().trimEnd() ? listText().trimEnd() + '\n' : '') + line + '\n');
  // Lines the app writes read "[id] Name": the brackets are what the line
  // means, the name is there so the list can be read and edited by a person.
  const addLine = (id, name, qty) => append(NervaParse.formatLine(id, name, qty));
  const listCount = () => (window.NervaParse ? NervaParse.parseList(listText()).length : 0);

  // --- nav, same on every page ---
  function nav(current) {
    const tabs = [['/', 'Checkout'], ['/items', 'Items'], ['/locations', 'Locations'], ['/settings', '⚙︎']];
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
        <div class="name">${esc(i.name)}${i.kind === 'set' ? ' <span class="tag">set</span>' : ''}${i.tracked ? ' <span class="tag">numbered</span>' : ''}</div>
        <div class="where">${bits}</div>
      </div>
      <button class="add" data-id="${i.id}" data-name="${esc(i.name)}" title="add to list" aria-label="add to list">+</button>
    </a>`;
  }

  // one place that turns a "+" click into a list line
  function wireAdd(container) {
    container.addEventListener('click', e => {
      const b = e.target.closest('.add'); if (!b) return;
      e.preventDefault();
      addLine(b.dataset.id, b.dataset.name);
      b.textContent = '✓'; setTimeout(() => { b.textContent = '+'; }, 700);
    });
  }

  // --- photos: resize in the browser, the server only stores bytes ---
  async function resizePhoto(file, max, quality) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, (max || 1280) / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return new Promise(r => c.toBlob(r, 'image/jpeg', quality || 0.82));
  }
  // No `capture` attribute on purpose: on a phone the sheet offers both the
  // camera and the gallery, so a photo taken earlier can be used too.
  function pickPhoto() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.onchange = () => resolve(input.files[0] || null);
      input.click();
    });
  }
  // The whole photo flow: pick, shrink, optionally highlight with a finger.
  // Returns a JPEG blob ready to upload, or null if the user backed out.
  async function photoFromCamera() {
    const file = await pickPhoto();
    if (!file) return null;
    const small = await resizePhoto(file);
    if (!window.NervaPaint) return small;
    return NervaPaint.highlight(small);
  }

  async function uploadPhoto(id, type, blob) {
    const r = await fetch(`/api/items/${id}/photo?type=${type}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'upload failed');
    refreshCatalogue();
    return d;
  }
  async function removePhoto(id, type) {
    const r = await fetch(`/api/items/${id}/photo?type=${type}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || 'could not remove');
    refreshCatalogue();
  }
  // Locations and shelves: same upload, different owner.
  async function uploadPlacePhoto(placeId, blob) {
    const r = await fetch(`/api/places/${placeId}/photo`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'upload failed');
    return d;
  }
  async function removePlacePhoto(placeId) {
    const r = await fetch(`/api/places/${placeId}/photo`, { method: 'DELETE' });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))).error) || 'could not remove');
  }
  async function deleteItem(id) {
    const r = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'could not delete');
    refreshCatalogue();
  }
  // The cached catalogue is stale the moment anything is written. Quietly refetch.
  function refreshCatalogue() {
    return fetch('/api/catalogue.json').then(r => r.json())
      .then(d => { catalogue = d.items; set('nerva.catalogue', JSON.stringify(catalogue)); if (d.config) { config = d.config; set('nerva.config', JSON.stringify(config)); } })
      .catch(() => {});
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  return { esc, loadCatalogue, refreshCatalogue, get catalogue() { return catalogue; }, get config() { return config; }, listText, setList, addLine, listCount,
    nav, status, itemRow, wireAdd, appendLine: append, resizePhoto, pickPhoto, photoFromCamera, uploadPhoto, removePhoto,
    uploadPlacePhoto, removePlacePhoto, deleteItem };
})();
