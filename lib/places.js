// Where things live. Two levels, because that is how a lab actually talks:
//
//   location  "Cabinet C"            id: cab003
//   shelf     "Cabinet C, drawer 4"  id: cab003-4
//
// Same id shape as a product's units: a base id, a hyphen, a number. Both
// carry a photo and a QR code; scanning a shelf shows what belongs on it.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(
    typeof require === 'function' ? require('./units') : null);
  else root.NervaPlaces = factory(root.NervaUnits);
})(typeof self !== 'undefined' ? self : this, function (units) {
  const splitPlaceId = id => units.splitUnitId(id);
  const shelfId = (locationId, n) => `${locationId}-${n}`;

  // "Cabinet C, drawer 4" – the text stored on an item and shown in search.
  function placeName(location, shelf) {
    if (!location) return '';
    return shelf ? `${location.name}, ${shelf.name}` : location.name;
  }

  return { splitPlaceId, shelfId, placeName };
});
