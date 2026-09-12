# Nerva – notes for AI coding agents

Read PLAN.md before changing anything. It is the spec.

Rules that keep this project simple:
- The list is the product. Plain text, one line per item, parsed by ONE shared parser used by the web page, the API and the CLI. Never invent a second input path.
- Plain Node 22 + Express. No TypeScript, no bundler, no framework on the frontend, no database.
- State = files in `data/`. One JSON per item/loan, atomic write (tmp + rename), in-memory map loaded at startup.
- Filing applies line by line and reports per line. Good lines stick, bad lines are returned for retry. No transactions.
- Identity is the signed email cookie or the `X-Who` header. No passwords, no OAuth unless the user asks.
- Keep the dependency list tiny: express, cookie-session, multer, qrcode, dotenv. Ask before adding anything else.
- Photos are resized in the browser (`Nerva.resizePhoto`, max 1280 px JPEG) and POSTed as a raw `image/jpeg` body. The server just writes the file, so there is no multipart parser and no image library.
- Dependencies: express, dotenv, qrcode. Ask before adding anything else.
- After any write from the browser, call `Nerva.refreshCatalogue()`, or the cached catalogue goes stale.
- Code layout is PLAN.md section 7: one concern per file, under ~150 lines. A verb is one file in `verbs/` with the signature `async (lines, who, store) => results`, discovered by filename. Tests in `test/` call verbs directly with an in-memory store.
- Adoption rule: the correct action must be the shortest action. If a user can notice wrong data on a screen, that screen needs a one-tap fix that does not require admin. Never add a required field, approval step or lock.
- A product is bulk (a quantity, one QR) or tracked (`tracked: true` plus `units: [{n}]`, one QR each at `<id>-<n>`). Resolve any id with `store.resolve(id)` -> `{ item, unit }`; never assume `store.items.get(id)`. A tracked product's `quantity` is derived on save, never edited. Unit numbers come from `nextUnit` and are never reused.
- Places are records: a location (`cab003`) holds shelves (`cab003-4`), both with a photo and a QR. Resolve with `store.resolvePlace(id)`. An item keeps `shelf` (the id) and `location` (the readable text); after any rename call `store.syncPlaceText(placeId)` so the text stays true.
- Photos go through `Nerva.photoFromCamera()`: pick, shrink, then the finger-paint highlighter in `public/paint.js`. The highlight is flattened into the JPEG, never stored separately.
- Pages are Checkout (`/`), Items (`/items`) and later Locations (`/locations`). Shared styles live in `public/app.css`, shared browser helpers in `public/app.js` (cached catalogue, the list, nav, item rows). A page adds only what is its own.
- `/` is first of all a lookup tool: search box on top, instant, local, offline. Never make search wait on the server.
- Mobile first. `/` must work one-handed on a phone at the shelf, offline except for pressing a verb.
- Follow the build order in PLAN.md section 9. Finish a step fully (page + API + test) before starting the next.
- `data/config.json` holds settings a user can change (`/settings`). `data/runtime.json` is not settings: it holds the address the app is currently reachable on, written by `bin/tunnel.js` and cleared on exit.
- Printed QR labels resolve their address as: live tunnel, then `BASE_URL`, then the request host.
- Two label paths: `/labels` for an A4 sheet, `/sticker?id=x` for one 2x3" pocket-printer sticker shared to the phone. Pocket ZINK printers have no protocol to print to, so never promise direct printing.
- Never commit `data/` or `.env`.
