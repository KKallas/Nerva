# Nerva – plan

Stock management for the robotics lab at Narava University.
Goal: **ultra simple to use day to day, ultra simple to run.** One process, one folder of data, no database, no real login.

## 1. The core idea: look it up, build a list, file it

**The most common use is a lookup.** You need M5 bolts: you open Nerva on your phone, type `m5`, and see *"M5 bolts 20 mm, Cabinet C, drawer 4, ~200 left"* with a photo of that drawer. You never walk to the wrong shelf. That is why `/` opens straight into a search box, why search is instant and works offline, and why every item has a photo of its home.

Everything else you do in the lab is the same two moves:

1. **Make a list** by scanning QR codes (or typing). The list is plain text, one line per item. It lives in your browser, works offline, needs no login. You can edit it like any text.
2. **File the list** in one go with a verb: `out`, `in`, `count`, `new`, `find`. The server applies every line, tells you which lines worked and which did not, and keeps the failed ones in your list for another try.

So "I need a multimeter, some jumper wires and soldering set 3" is: scan, scan, scan, tap **out**. Done in ten seconds at the shelf. Returning is the same list with **in**. Stocktaking is scan + quantities + **count**. Unpacking a delivery is a list of names + **new**, which prints the labels.

### List format

```
a7k3q9              one multimeter
b2x8   x3           three of item b2x8
s0ld3r              soldering set 3
s0ld3r - tweez1 x1  (in mode) set returned, one tweezers missing
Jumper wires 40pc   (new mode) any line that is not an id becomes a new item
# comments and blank lines are ignored
```

Rules: first token is the id, `xN` anywhere is quantity (default 1), `- <id> [xN]` after a set lists missing parts, everything else is a note. The same parser is used by the web page, the API and the CLI.

### Verbs

| Verb    | Meaning                                   | Result                                                   |
|---------|-------------------------------------------|----------------------------------------------------------|
| `find`  | Where is this, do we have it              | Location, photo of the location, quantity. No write.     |
| `out`   | I am taking these                         | Loans created, quantities decremented                    |
| `in`    | I am bringing these back                  | Loans closed. Sets with `-` lines get `missing` entries   |
| `count` | The shelf actually has this many          | Quantity set to `xN`, difference logged                  |
| `new`   | Create these items                        | Ids assigned, label sheet opened for printing            |

`find` and building the list need nothing. `out`, `in`, `count` need to know who you are (see §6). `new` and editing need admin.

### Search that is faster than walking

- The whole catalogue (id, name, description, tags, location, quantity; no photos) is one JSON of ~200 KB for 2000 items. The browser downloads it once, keeps it in `localStorage`, refreshes it in the background. Search-as-you-type runs locally: results appear on the first keystroke, on the lab Wi-Fi or without it.
- Matching is forgiving: case-insensitive, every typed word must appear somewhere in name, description, tags or location (`m5 20` finds "M5 bolts 20 mm"). Tags carry the synonyms people actually say (`bolt, screw, M5, hex`).
- Each result shows name, quantity, location text and the location photo thumbnail. Tap for the full item page, tap **+** to add it to the list.
- The page is installable ("Add to Home Screen", a `manifest.json` and a 30-line service worker caching the app shell and the catalogue). Opening it is one tap and takes under a second.

## 2. Architecture (deliberately boring)

```
browser (one static page + vanilla JS, list in localStorage)
   │  HTTPS (Caddy in front, or the uni reverse proxy)
   ▼
node server.js  (Express)         ── one process, ~1000 lines total
   │
   ▼
data/                             ── the whole state; back it up by copying the folder
```

| Concern       | Choice                                           | Why                                          |
|---------------|--------------------------------------------------|----------------------------------------------|
| Backend       | Node 22 + Express                                | Everyone can read it, LLMs write it well     |
| Storage       | One JSON file per item / loan, photos as files   | `ls`, `cat`, `git`, `rsync` all just work    |
| Frontend      | Static HTML + vanilla JS, served by the same app | No bundler, no framework upgrades            |
| The list      | `localStorage`, plain text                       | Survives closing the browser, works offline  |
| Identity      | Email in a signed cookie, entered once           | No passwords, no identity provider           |
| Photos        | Resized **in the browser** (canvas, max 1280 px) | No image libraries on the server             |
| QR codes      | `qrcode` npm package, rendered on demand         | Nothing to store                             |
| Scanning      | `BarcodeDetector` in the browser, `jsQR` fallback | No native app                               |
| Deployment    | `node server.js` behind Caddy, or Dockerfile     | One box, one command                         |

No database, no ORM, no build pipeline, no OAuth. If something needs a second service, the answer is probably "no".

## 3. Data layout

```
data/
  config.json            # lab name, admin emails, default loan period
  users.json             # { "<email>": { name, role, firstSeen, lastSeen } }
  items/<id>.json        # one file per item or set
  loans/<id>.json        # one file per loan (open or closed)
  photos/<id>-item.jpg   # item photo
  photos/<id>-loc.jpg    # default location photo
  log.jsonl              # append-only audit log, one JSON event per line
```

### Item (`data/items/<id>.json`)

```json
{
  "id": "a7k3q9",
  "kind": "item",
  "name": "Multimeter UNI-T UT61E",
  "description": "True-RMS, 22000 counts",
  "location": "Cabinet B, shelf 2",
  "quantity": 4,
  "tags": ["measurement"],
  "photo": true,
  "locationPhoto": true,
  "createdAt": "2026-09-12T10:00:00Z",
  "updatedAt": "2026-09-12T10:00:00Z"
}
```

Ids are 6 lowercase alphanumerics, unambiguous to type (no `0/o`, `1/l`). They are printed under every QR so a list can be typed when the camera is not handy.

### Set (`kind: "set"`)

A set is an item whose `contents` list other items. Sets usually have `quantity: 1` and a physical number.

```json
{
  "id": "s0ld3r",
  "kind": "set",
  "name": "Soldering set #3",
  "location": "Cabinet A, drawer 1",
  "quantity": 1,
  "contents": [
    { "itemId": "iron01", "qty": 1 },
    { "itemId": "wick01", "qty": 1 },
    { "itemId": "tweez1", "qty": 2 }
  ],
  "missing": [ { "itemId": "tweez1", "qty": 1, "since": "2026-09-10", "loanId": "L00042" } ]
}
```

`missing` is non-empty ⇒ the set is *incomplete* and shown with a warning. Admin files a `fix` on it (`s0ld3r` in **fix** mode) which decrements the component item's `quantity` and clears the entry.

### Loan (`data/loans/<id>.json`)

```json
{
  "id": "L00042",
  "itemId": "s0ld3r",
  "qty": 1,
  "who": "mari@narava.edu",
  "borrowedAt": "2026-09-12T10:00:00Z",
  "dueAt": "2026-09-26T10:00:00Z",
  "returnedAt": null,
  "missing": [ { "itemId": "tweez1", "qty": 1 } ],
  "note": ""
}
```

### Concurrency

Load all `items/` and `loans/` into memory at startup (2000 small files ≈ instant). Every write goes to the in-memory map **and** to disk atomically (write `tmp`, then `rename`). Express is single-threaded, so there are no races between requests. One log line per change in `log.jsonl`. Filing a list is applied line by line, never as a transaction: a bad line is reported, the good ones stick. That is what the user expects from a paper list too.

## 4. Pages

One app page does nearly everything; the rest are small.

| URL                  | Who   | What                                                        |
|----------------------|-------|-------------------------------------------------------------|
| `/`                  | all   | **Search + list.** Search box on top with instant local results (location, photo, quantity, **+**). Below it the list: textarea, scan button (camera overlay, each scan appends a line), verb buttons `find out in count new`, results under each line after filing. |
| `/i/<id>`            | all   | Item page: photos, location, quantity, QR, "add to list", history. **QR codes point here**, so a phone camera app lands on it and one tap adds it to the list. |
| `/i/<id>/edit`       | admin | Edit fields, contents (for sets), take / upload photos (`<input capture>`) |
| `/search?q=`         | all   | Text search, results with location thumbnail, "add to list" |
| `/loans`             | all   | My open loans (everyone), all open loans + overdue (admin)   |
| `/incomplete`        | admin | Sets with missing parts, `fix` button                       |
| `/labels?ids=a,b,c`  | all   | Printable A4 sheet of QR labels (name + id + QR)             |
| `/hello`             | all   | "Who are you?" – email + name, sets the cookie. Shown the first time you file. |
| `/admin`             | admin | Users & roles, export zip, CSV import                       |

Mobile first: the main use is one hand holding a phone at the shelf. Everything on `/` works offline except pressing a verb.

## 5. API

Plain and curl-friendly. The text format is the API.

```
POST   /api/file?verb=out               body: text/plain (the list) or JSON { text }
                                        → { lines: [ { line, ok, message, item? } ] }
GET    /api/items?q=                    search
GET    /api/items/:id
PUT    /api/items/:id                   admin
DELETE /api/items/:id                   admin (refused if open loans)
POST   /api/items/:id/photo?type=item|loc   admin, multipart JPEG
GET    /api/items/:id/qr.png            PNG of https://<host>/i/<id>
GET    /api/loans?open=1&mine=1
GET    /api/me
GET    /api/users            admin
PUT    /api/users/:email     admin  { role }
GET    /api/export.zip       admin
POST   /api/import.csv       admin
```

Identity for scripts: `X-Who: mari@narava.edu` header, or the cookie. So from a laptop:

```sh
curl -sS -H 'X-Who: mari@narava.edu' --data-binary @list.txt 'https://nerva.lab/api/file?verb=out'
```

A tiny `bin/nerva` CLI wraps this (`nerva out a7k3q9 b2x8`, `nerva find multimeter`, `nerva in - < list.txt`). Same parser, same server.

## 6. Identity: a cookie, not a login

The lab is a trusted room. The system needs to know *who* took what, not to prove it.

1. First time you press `out`/`in`/`count`, `/hello` asks for your email and name. That is the whole registration.
2. The server stores `{ email, name, role }` in a signed cookie (`cookie-session`, one year). Signed means a user cannot silently change their email, but there is no password. Clearing the cookie just means typing the email again.
3. `users.json` gets a row on first sight. Role is `admin` if the email is in `config.json.adminEmails` or was promoted in `/admin`, otherwise `user`.
4. `new`, `fix`, edit, delete, `/admin` require `admin`.

If the university ever demands real login, `/hello` is the only page to swap for a Microsoft Entra ID redirect (`openid-client`, ~60 lines). Everything else keys on the email and stays the same. Do not build that until someone asks.

## 7. Code layout: small modules an LLM can edit in one go

The rule: **one concern, one file, under ~150 lines, no clever sharing.** Adding a verb, page or field should mean touching one or two files that a coding agent can read in full.

```
server.js              starts Express, mounts routes, nothing else
lib/store.js           load/save JSON files, atomic writes, in-memory maps, log()
lib/parse.js           the list parser (also served to the browser as-is)
lib/who.js             cookie / X-Who identity, requireAdmin()
verbs/find.js          one file per verb, same signature:
verbs/out.js             module.exports = async (lines, who, store) => results
verbs/in.js
verbs/count.js
verbs/new.js
verbs/fix.js
routes/items.js        item CRUD, photos, qr
routes/file.js         POST /api/file → picks verbs/<verb>.js by name
routes/loans.js
routes/admin.js
public/index.html      search + list page (inline JS, no imports)
public/item.html       item page
public/labels.html     print sheet
public/parse.js        symlink/copy of lib/parse.js
public/sw.js           service worker
bin/nerva              CLI, ~80 lines, calls POST /api/file
test/*.test.js         node:test, one file per verb, run with `node --test`
```

Conventions that make LLM edits safe:
- A new verb is one new file in `verbs/` plus one button in `index.html`. The router discovers verbs by filename, no registration list.
- Every verb function is pure over its inputs: takes parsed lines, `who`, and the store, returns `[ { line, ok, message } ]`. Tests call it with an in-memory store, no HTTP.
- No shared helpers beyond `lib/`. Duplication of five lines is preferred to an abstraction across modules.
- Item fields are optional everywhere. Adding a field is: read/write it in `routes/items.js`, show it in `item.html`. Old JSON files never need migrating.
- `CLAUDE.md` in the repo root repeats these rules for the agent.

## 8. Operations

- **Run:** `cp .env.example .env`, set `SESSION_SECRET` and `ADMIN_EMAILS`, `npm install`, `node server.js`. Or `docker compose up`.
- **HTTPS:** Caddy with two lines of config (`Caddyfile` provided). Needed because phone browsers only allow the camera on HTTPS.
- **Backup:** `data/` is the whole system. Nightly `rsync` or `zip` from cron, or the *Export* button in `/admin`.
- **Restore:** copy the folder back, restart.
- **Migrations:** none. New fields are optional; old JSON keeps working.
- **Upgrade:** `git pull && npm install && restart`.

## 9. Build order (each step is a shippable increment, sized for one LLM session)

1. **Lookup** – Express, JSON store with atomic writes, `/api/catalogue.json`, `/` with instant local search (location + photo + quantity), item page, `manifest.json` + service worker. No identity needed yet. Usable on day one for "which shelf".
1b. **List + find** – the textarea, shared parser in `lib/parse.js`, `verbs/find.js`, `POST /api/file`.
2. **Scan + QR + labels** – camera overlay appending to the list, `/api/items/:id/qr.png`, `/labels` print sheet, photos with client-side resize, `/i/<id>/edit`.
3. **Identity + out/in/count** – `/hello` cookie, `users.json`, `POST /api/file` for `out`, `in`, `count`, `/loans`.
4. **Sets** – contents editor, `- part xN` lines on `in`, `missing`, `/incomplete`, `fix`.
5. **new + admin** – `new` verb creating items from names and opening `/labels`, `/admin`, export zip, CSV import.
6. **Ops** – Dockerfile, Caddyfile, `bin/nerva` CLI, overdue list.

Optional later, only if wanted:
- LLM assist: photograph an item → suggest name/description/tags (one API call, behind a button on the edit page).
- Microsoft Entra ID replacing `/hello`.
- Email reminder for overdue loans (one cron script).

## 10. Explicit non-goals

No multi-lab tenancy, no purchase orders, no barcode printers beyond a normal A4 printer, no realtime sync, no mobile app, no passwords. If it needs more than one server process, it is out of scope.
