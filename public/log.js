// One way to show the log, used by the item, place and person pages. The
// server sends the same events to all three; what differs is what goes
// without saying: an item's page does not repeat the item, a person's page
// does not repeat the person.
window.NervaLog = (function () {
  const esc = Nerva.esc;
  const b = t => `<b>${esc(t)}</b>`;
  const qty = e => (e.qty > 1 ? ` ×${e.qty}` : '');
  const place = (id, name) => (id ? `<a href="/l/${esc(id)}">${esc(name || id)}</a>` : '');
  // brought back after the return date it was taken with
  const late = e => (e.due && e.at.slice(0, 10) > e.due ? ` · <span class="warn">late, was due ${esc(e.due)}</span>` : '');

  const SAID = {
    out: e => `${b('checked out')}${qty(e)}${e.placeId ? ' from ' + place(e.placeId, e.placeName) : ''}, back by ${esc(e.due)}`,
    in: (e, self) => `${b('checked in')}${qty(e)}${e.fromName && e.from !== self.person ? ', brought back by ' + person(e.from, e.fromName) : ''}${e.placeId ? ', to ' + place(e.placeId, e.placeName) : ''}${late(e)}`,
    used: e => `${b('taken')}${qty(e)}, used up${e.placeId ? ', from ' + place(e.placeId, e.placeName) : ''} · ${e.left} left`,
    count: e => `counted ${b(`${e.was ?? e.from} → ${e.to}`)}`,
    filed: e => (e.shelf ? `${b('put on')} ${place(e.shelf, e.placeName)}${e.fromShelf ? ', moved from ' + place(e.fromShelf, e.fromPlaceName) : ''}`
      : `${b('taken off')} ${place(e.fromShelf, e.fromPlaceName) || 'its shelf'}`),
    due: e => `return date of ${esc(e.id)} moved to ${b(e.due)}`,
    new: e => `added${e.quantity != null ? `, ${e.quantity} of them` : ''}`, edit: e => `edited ${esc((e.fields || []).join(', '))}`,
    delete: e => `deleted ${esc(e.name)}`, photo: e => `photo added${e.which === 'loc' ? ' of where it lives' : ''}`, 'photo-removed': () => 'photo removed',
    tracked: e => (e.tracked ? 'started numbering each one' : 'went back to a plain quantity'),
    'units-added': e => `added #${(e.units || []).join(', #')}`, 'unit-removed': e => `retired #${e.unit}`,
    consumable: e => (e.consumable ? 'marked as used up, not expected back' : 'marked as lent, expected back'),
    'location-new': e => `location created: ${esc(e.name)}`, 'location-renamed': e => `renamed to ${esc(e.name)}`, 'location-deleted': e => `location deleted: ${esc(e.name)}`,
    'shelf-new': e => `shelf added: ${esc(e.name)}`, 'shelf-deleted': () => 'shelf removed', 'place-photo': () => 'photo of the place added',
    'user-new': e => `account created for ${esc(e.user)}`, 'user-edit': e => `account ${esc(e.user)} changed`, 'user-reset': e => `password of ${esc(e.user)} reset`,
    'user-card': e => `new login card for ${esc(e.user)}`, 'user-delete': e => `account ${esc(e.user)} deleted`,
    'password-set': () => 'chose a password', 'password-change': () => 'changed password', settings: () => 'changed the lab settings',
  };

  // A name is a link only for someone who may open that page: an admin, or yourself.
  function person(username, name) {
    const may = Nerva.me && (Nerva.me.role === 'admin' || Nerva.me.username === username);
    return may ? `<a href="/u/${esc(username)}">${esc(name || username)}</a>` : esc(name || username);
  }
  const when = at => { const d = new Date(at); const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  // self: { item } or { person } is what the page is about, and is left out.
  function line(e, self) {
    const thing = e.itemName && e.id !== self.item ? (e.isItem ? `<a href="/i/${esc(e.id)}">${esc(e.itemName)}</a> ` : esc(e.itemName) + ' ') : '';
    const by = e.who && e.who !== self.person ? ` · ${person(e.who, e.whoName)}` : '';
    return `<li><span class="when">${when(e.at)}</span> ${thing}${(SAID[e.type] || (x => esc(x.type)))(e, self)}${by}</li>`;
  }

  // Fill `el` with the newest events from `url`, and offer the rest.
  async function show(el, url, self, limit) {
    const n = limit || 12;
    let events;
    try { events = await Nerva.api('GET', `${url}?limit=${n + 1}`); }
    catch (err) { el.innerHTML = `<li>${esc(err.message)}</li>`; return; }
    el.innerHTML = events.slice(0, n).map(e => line(e, self || {})).join('') || '<li>Nothing has happened here yet.</li>';
    if (events.length > n) {
      el.insertAdjacentHTML('beforeend', '<li><button class="more">show more</button></li>');
      el.querySelector('.more').onclick = () => show(el, url, self, n * 5);
    }
  }
  return { show, line, when };
})();
