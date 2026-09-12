// QR codes and the printable label sheet. A QR holds the item's web address,
// so any phone camera opens the item page.
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');

module.exports = function qrRoutes(store) {
  const router = express.Router();

  const baseUrl = req => (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');

  router.get('/api/items/:id/qr.svg', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!store.items.has(id)) return res.status(404).send('no such item');
    const svg = await QRCode.toString(`${baseUrl(req)}/i/${id}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=3600').send(svg);
  });

  router.get('/api/items/:id/qr.png', async (req, res) => {
    const id = String(req.params.id).toLowerCase();
    if (!store.items.has(id)) return res.status(404).send('no such item');
    const png = await QRCode.toBuffer(`${baseUrl(req)}/i/${id}`, { margin: 1, width: Number(req.query.w) || 512 });
    res.type('image/png').set('Cache-Control', 'public, max-age=3600').send(png);
  });

  // /labels?ids=a,b,c  – an A4 sheet to print and stick on shelves and boxes.
  router.get('/labels', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'labels.html')));

  return router;
};
