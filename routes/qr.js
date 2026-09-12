// QR codes and the printable label sheet. A QR holds the item's web address,
// so any phone camera opens the item page.
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');

module.exports = function qrRoutes(store) {
  const router = express.Router();

  // What a scanned label should open. A live tunnel wins, because starting one
  // is an explicit "I am testing on my phone now" and a stale BASE_URL left in
  // .env would otherwise send every label to an address that does not exist.
  // Then a configured address, then whatever host this request came in on.
  const baseUrl = req => (store.runtime.publicUrl || process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  // QR of arbitrary text, used by the settings page for this instance's address
  router.get('/api/qr.svg', async (req, res) => {
    const text = String(req.query.text || '').slice(0, 512);
    if (!text) return res.status(400).send('text required');
    const svg = await QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
  });

  router.get('/api/items/:id/qr.svg', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!store.resolve(id)) return res.status(404).send('no such item');
    const svg = await QRCode.toString(`${baseUrl(req)}/i/${id}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  });

  router.get('/api/items/:id/qr.png', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!store.resolve(id)) return res.status(404).send('no such item');
    const png = await QRCode.toBuffer(`${baseUrl(req)}/i/${id}`, { margin: 1, width: Number(req.query.w) || 512 });
    res.type('image/png').set('Cache-Control', 'public, max-age=3600').send(png);
  });

  // /labels?ids=a,b,c  – an A4 sheet to print and stick on shelves and boxes.
  router.get('/labels', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'labels.html')));

  return router;
};
