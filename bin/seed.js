#!/usr/bin/env node
// Fills an empty data/ with sample items so there is something to search.
// Usage: node bin/seed.js [--force]
require('dotenv').config();
const path = require('path');
const { Store } = require('../lib/store');

const store = new Store(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
if (store.items.size && !process.argv.includes('--force')) {
  console.log(`data already has ${store.items.size} items; use --force to add samples anyway`);
  process.exit(0);
}

const L = { A: 'Cabinet A, drawer 1', B: 'Cabinet B, shelf 2', C: 'Cabinet C, drawer 4', D: 'Bench 3, top shelf', E: 'Cabinet C, drawer 2', F: 'Wall rack' };
const items = [
  ['M5 bolts 20 mm', 200, L.C, 'bolt screw hex m5', 'Hex socket head, stainless'],
  ['M5 nuts', 300, L.C, 'nut m5'],
  ['M3 bolts 10 mm', 500, L.E, 'bolt screw m3'],
  ['M3 bolts 16 mm', 250, L.E, 'bolt screw m3'],
  ['M3 nuts', 400, L.E, 'nut m3'],
  ['M3 washers', 600, L.E, 'washer m3'],
  ['Multimeter UNI-T UT61E', 4, L.B, 'measurement multimeter dmm', 'True-RMS, 22000 counts'],
  ['Multimeter Fluke 117', 1, L.B, 'measurement multimeter dmm'],
  ['Oscilloscope Rigol DS1054Z', 2, L.D, 'measurement scope'],
  ['Lab power supply 30V 5A', 3, L.D, 'psu power supply'],
  ['Soldering iron TS100', 6, L.A, 'soldering iron'],
  ['Solder 0.8 mm leaded', 10, L.A, 'soldering solder tin'],
  ['Desoldering wick', 12, L.A, 'soldering wick braid'],
  ['Tweezers ESD', 14, L.A, 'tweezers soldering'],
  ['Flux pen', 8, L.A, 'soldering flux'],
  ['Helping hands', 4, L.A, 'soldering third hand'],
  ['Jumper wires M-M 40pc', 15, L.B, 'wire dupont jumper'],
  ['Jumper wires F-F 40pc', 12, L.B, 'wire dupont jumper'],
  ['Breadboard 830 pt', 20, L.B, 'breadboard prototyping'],
  ['Arduino Uno R3', 18, L.B, 'arduino mcu board'],
  ['Raspberry Pi 4 4GB', 6, L.B, 'raspberry pi sbc'],
  ['ESP32 DevKit', 25, L.B, 'esp32 mcu wifi board'],
  ['Servo SG90', 30, L.F, 'servo motor'],
  ['DC motor 12V', 10, L.F, 'motor'],
  ['Stepper NEMA17', 8, L.F, 'stepper motor'],
  ['LiPo 3S 2200mAh', 6, L.D, 'battery lipo'],
  ['Heat gun', 2, L.D, 'tool heat'],
  ['Digital caliper 150 mm', 3, L.B, 'measurement caliper'],
  ['Screwdriver set precision', 5, L.A, 'tool screwdriver'],
  ['Hex key set metric', 4, L.A, 'tool hex allen'],
];
const ids = {};
for (const [name, quantity, location, tags, description] of items) {
  const id = store.newId();
  ids[name] = id;
  store.saveItem({ id, kind: 'item', name, quantity, location, tags: tags.split(' '), description: description || '' });
}
for (const n of [1, 2, 3]) {
  store.saveItem({
    id: store.newId(), kind: 'set', name: `Soldering set #${n}`, quantity: 1, location: L.A, tags: ['set', 'soldering'],
    description: 'Iron, solder, wick, tweezers, flux. Rent as a whole.',
    contents: [
      { itemId: ids['Soldering iron TS100'], qty: 1 }, { itemId: ids['Solder 0.8 mm leaded'], qty: 1 },
      { itemId: ids['Desoldering wick'], qty: 1 }, { itemId: ids['Tweezers ESD'], qty: 2 }, { itemId: ids['Flux pen'], qty: 1 },
    ],
    missing: [],
  });
}
store.log({ type: 'seed', count: store.items.size });
console.log(`seeded ${store.items.size} items into ${store.dir}`);
