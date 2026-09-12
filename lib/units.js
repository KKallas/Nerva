// Two kinds of thing live in the catalogue:
//
//   bulk     – a box of M5 bolts. One QR on the box, a quantity, nothing else.
//   tracked  – an oscilloscope, a soldering set. Each physical one is a unit
//              with its own number and its own QR: <id>-1, <id>-2, …
//
// A unit id is the product id, a hyphen, and the unit number. Unit numbers are
// never reused, so a label that is still stuck on something can never point at
// a different object.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NervaUnits = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const UNIT_RE = /^([a-z0-9]{4,8})-(\d{1,4})$/;

  // "338va6-2" → { baseId: "338va6", n: 2 };  anything else → null
  function splitUnitId(id) {
    const m = UNIT_RE.exec(String(id || '').toLowerCase());
    return m ? { baseId: m[1], n: Number(m[2]) } : null;
  }

  const unitId = (id, n) => `${id}-${n}`;

  // What the shelf holds: a tracked product has as many as it has units.
  const quantityOf = item => (item && item.tracked ? (item.units || []).length : (item && item.quantity) || 0);

  // Label under a unit's QR, e.g. "Oscilloscope Rigol DS1054Z #2"
  const unitName = (item, n) => `${item.name} #${n}`;

  // Where one of them lives. A numbered one can sit somewhere of its own; when
  // it does not, it is wherever the product says, which is the usual case.
  function placeOf(item, unit) {
    if (unit && unit.shelf) return { shelf: unit.shelf, location: unit.location || '', own: true };
    return { shelf: item.shelf || null, location: item.location || '', own: false };
  }

  return { UNIT_RE, splitUnitId, unitId, quantityOf, unitName, placeOf };
});
