# Nerva – plan

Stock management for the robotics lab at Narava University.
Goal: **ultra simple to use day to day, ultra simple to run.** One process, one folder of data, no database, no identity provider.

## 1. The core idea: look it up, build a list, file it

**The most common use is a lookup.** You need M5 bolts: you open Nerva on your phone, type `m5`, and see *"M5 bolts 20 mm, Cabinet C, drawer 4, ~200 left"* with a photo of that drawer. You never walk to the wrong shelf. That is why `/` opens straight into a search box, why search is instant and works offline, and why every item has a photo of its home.

Everything else you do in the lab is the same two moves:

1. **Make a list** by scanning QR codes (or typing). The list is plain text, one line per item. It lives in your browser, works offline, needs no login. You can edit it like any text.
2. **File the list** in one go with a verb: `out`, `in`, `count`, `new`, `find`. The server applies every line, tells you which lines worked and which did not, and keeps the failed ones in your list for another try.

So "I need a multimeter, some jumper wires and soldering set 3" is: scan, scan, scan, tap **out**. Done in ten seconds at the shelf. Returning is the same list with **in**. Stocktaking is scan + quantities + **count**. Unpacking a delivery is a list of names + **new**, which prints the labels.

### List format

```
[a7k3q9] Multimeter UNI-T UT61E        one multimeter
[b2x8] Jumper wires M-M x3             three of them
[s0ld3r-2] Soldering set #2            that one numbered set
[s0ld3r-2] Soldering set #2 - tweez1 x1   (in) returned, one tweezers missing
a7k3q9                                 a bare id, for typing or scanning
Jumper wires 40pc                      (new) a line that is no id becomes an item
# comments and blank lines are ignored
```

Rules: an id in square brackets at the start of a line is what the line **means**;
everything after it is the name, there so the list can be read and edited by a
person, and it can be changed or lost without changing the line. A bare first
token that looks like an id still works, so a scan or a typed code needs no
brackets. `xN` anywhere is the quantity (default 1), `- <id> [xN]` after a set
lists missing parts. Every line the app writes is in the bracketed form. The
same parser is used by the web page, the API and the CLI.

### Verbs

| Verb    | Meaning                                   | Result                                                   |
|---------|-------------------------------------------|----------------------------------------------------------|
| `find`  | Where is this, do we have it              | Location, photo of the location, quantity. No write.     |
| `out`   | I am taking these                         | Asks once to confirm, with a return date. Saved as one checkout under your name: a loan per line, quantities decremented. Things that get used up just leave the shelf |
| `in`    | These are back (admin)                    | Loans closed, quantities restored. Sets with `-` lines get `missing` entries |
| `count` | The shelf actually has this many          | Quantity set to `xN`, difference logged                  |
| `new`   | Create these items                        | Ids assigned, label sheet opened for printing            |

`find` and building the list need nothing. `out` and `count` need you to be logged in (see §6). `in`, deleting and managing users need admin.

### Checkouts

Pressing **out** does not file straight away. It shows the list back to you as *"Check out as Mari"*: every line with what the shelf holds, a **return date** (today plus the lab's loan period, changeable), and **Confirm checkout**. Confirming saves the list as one **checkout** (`C00007`) under your name: one loan per line, all with the same borrower and return date, so the list stays one thing on `/loans` while each line can come back on its own.

- **Already out is shown before you try.** The catalogue carries what is on loan and when it is due, so the search results, the list as it is built, and the confirm step all say *"Scope #2 · out with mari until 2026-10-01"*, offline. A numbered one that is out is refused on filing; a quantity is never refused, because a short shelf means the count was wrong, not the person.
- **Things that get used up** (bolts, glue, tape) have `consumable: true`, one switch on the item page or a tick when adding it. Taking them lowers the quantity and makes no loan: nobody is chased for a roll of tape. Only a counted product can be used up; a numbered one is always expected back.
- **Checking in is the admin's job.** Someone looks at what came back before it counts as returned. `/loans` shows an admin every checkout, sortable by return date, person or newest, overdue ones marked, with **check in** per line and **check in all**. Everyone else sees their own checkouts there. It is still the same input path: the buttons file a list with `in`, narrowed to that checkout.
- The borrower, or an admin, can move a checkout's return date from `/loans` in one tap.


### One log, read three ways

Every change appends one line to `log.jsonl`, and every line can be found three ways: by the **thing** (`id`), by the **place** it happened at (`place`; `shelf` and `fromShelf` when something was moved), and by the **person** (`who` did it, `from` whose loan it was, `user` the account it was about). `out`, `in`, `used` and `count` write down the shelf the thing lived on at that moment, so the answer survives the item being moved later. Nothing is indexed: the three pages are three filters over the same lines.

- **An item's History** (on `/i/<id>`): which places it has been filed on, who checked it out and until when, who checked it in and whether that was late, counts, photos, edits. A product includes every numbered one of it; a numbered one shows its own and the product's.
- **A place's History** (on `/l/<id>`): what was put here and by whom, what was moved away, what was taken from here and brought back. A location includes all its shelves.
- **A person's page** (`/u/<username>`): what they have now with return dates and days late, what they returned, when and to whom, and everything they did. Open to that person and to an admin.
- **Overview** (`/overview`, admin): what is late and by how many days, longest first; people with things not yet returned; items that are out and with whom; places with things missing. Nothing is stored for it: it is the open loans, counted three ways.

### Why people will keep the data in order

Nobody maintains an inventory out of duty. They keep it right only if the correct action is also the shortest way to what they want. Every design choice below is checked against that:

- **Lookup is the reward.** Nerva answers "where is it, is there any, who has it" faster than walking or asking in the chat. People open it because it saves them a trip, and every open is a chance to fix something.
- **Fixing is one tap from where you notice.** On the item page: *wrong shelf?* → retake the location photo and it is fixed. *Count is off?* → type the number. *Not here at all?* → **0**. No form, no admin, no "report to someone".
- **Taking is faster than not taking.** You already have the list from the lookup; `out` is one tap. Skipping it saves nothing.
- **Bringing back is one hand-over.** You give it to whoever runs the lab; they tap **check in** on your checkout. For a set the checklist is right there; noting a missing tweezer takes one tap and no blame is attached. The log shows what was noted, not who lost it.
- **Visibility replaces nagging.** "Soldering set 3 is with Mari since Tuesday" answers the question before it is asked. Overdue is a plain list, not an email.
- **Contributions are cheap and visible.** Adding a photo, a tag or a synonym takes seconds from a phone, and the next person's search gets better. The item page shows "last updated by" so good work is seen.
- **Nothing is punished.** No required fields beyond a name, no approval steps, no locked records. A wrong entry is fixed by the next person, and `log.jsonl` keeps history for the rare dispute.

Rule for every screen: **if a user can notice that data is wrong here, they must be able to fix it here, in one tap, without logging in as admin.**

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
| Identity      | Username + password, or a printed QR card + password; a signed cookie after that | No identity provider, and no extra dependency: `crypto.scrypt` and an HMAC-signed cookie |
| Photos        | Resized **in the browser** (canvas, max 1280 px), POSTed as a raw JPEG body | No image libraries and no upload parser on the server |
| Highlighting  | Darken the photo, wipe the dark away with a finger, flatten into the JPEG | The highlight is part of the picture: nothing extra to store, and every viewer shows it |
| Highlight edge| Soft round marks combined by `lighten`, the result shrunk and stretched back | Reads as a soft spotlight rather than a cut-out. `ctx.filter` was tried first and is unreliable on phones: Safari ignores it in some compositing modes, so the edge came out hard with no error |
| QR codes      | `qrcode` npm package, rendered on demand         | Nothing to store                             |
| Scanning      | `BarcodeDetector` in the browser, `jsQR` fallback | No native app                               |
| Deployment    | `node server.js` behind Caddy, or Dockerfile     | One box, one command                         |

No database, no ORM, no build pipeline, no OAuth. If something needs a second service, the answer is probably "no".

## 3. Data layout

```
data/
  config.json                # lab name, low stock threshold, loan period
  runtime.json               # the address this instance is reachable on right now
  users.json                 # { "<user id>": { username, name, role, card, password, session, … } }
  session-secret             # signs login cookies when SESSION_SECRET is not set
  items/<id>.json            # one file per product
  locations/<id>.json        # one file per location, shelves nested inside
  loans/<id>.json            # one file per loan (open or closed)
  photos/<id>-item.jpg       # the item, or the model of it
  photos/<id>-<n>-item.jpg   # this actual numbered one
  photos/<id>-loc.jpg        # where they live, shared by every unit
  photos/place-<id>.jpg      # a location or a shelf ("place-cab003-4.jpg")
  log.jsonl                  # append-only audit log, one JSON event per line
```

### Location (`data/locations/<id>.json`)

```json
{
  "id": "cab003",
  "name": "Cabinet C",
  "photo": true,
  "shelves": [
    { "n": 1, "name": "drawer 1", "photo": true },
    { "n": 4, "name": "drawer 4" }
  ],
  "nextShelf": 5
}
```

A shelf id is `cab003-4`, the same shape as a product's units. An item keeps
`shelf: "cab003-4"` **and** the readable `location: "Cabinet C, drawer 4"`, so
search and the catalogue never need to know that places are records. Renaming a
place rewrites that text on everything filed there. Shelf numbers are never
reused, so a label stuck on a drawer cannot come to mean another drawer.

### Two kinds of thing

A product is either **bulk** or **tracked**, and that single flag decides how QR codes work.

| | bulk | tracked |
|---|---|---|
| Example | M5 bolts, solder, jumper wires | oscilloscope, power supply, soldering set |
| QR codes | one, on the box | one per physical object: `<id>-1`, `<id>-2`, … |
| Quantity | a number you count and correct | however many units exist, derived |
| Borrowing | "three of these" | "this one, number 2" |
| Photo of the thing | one | one per numbered object, listed beside its QR |
| Where it lives | one shelf | the product's shelf is the default; any numbered one can be filed elsewhere on its own |
| Photo of where it lives | one | the product's, shared, until a numbered one is filed elsewhere and gets its own |
| Top of the page | both photos, side by side | one wide photo of where they all live |

Unit numbers are never reused. Retiring `#2` and adding another gives `#3`, so a label still stuck on something can never come to mean a different object. The product page lists every unit with its QR and its own photo beside it, and the one you arrived from is outlined, so a code in your hand matches a row on screen. A unit with no photo of its own shows the product's, dimmed, as an invitation to photograph the real one. The numbered product's own page carries a single wide photo of the place they share, since a picture of any one of them belongs to that one. Numbering is capped at 50 per product: past that you are counting, not labelling. A tracked set keeps its `missing` list per unit, since soldering set #2 can be short a tweezers while #3 is complete.

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
  "consumable": false,
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
  "checkout": "C00007",
  "itemId": "s0ld3r-2",
  "qty": 1,
  "returned": 0,
  "who": "mari",
  "borrowedAt": "2026-09-12T10:00:00Z",
  "dueAt": "2026-09-26",
  "returnedAt": null,
  "returnedTo": null,
  "missing": [ { "itemId": "tweez1", "qty": 1 } ]
}
```

`checkout` groups the loans that were one list. `itemId` is a product, or one numbered unit of it. `dueAt` is a plain local day: a return date has no time. A quantity can come back in parts: `returned` counts what is back, and the loan closes (`returnedAt`, `returnedTo` the admin who took it) when that reaches `qty`. A counted product's `quantity` is what is on the shelf, so `out` lowers it and `in` raises it; a numbered product's quantity is how many exist, and which are out is read from the open loans.

### Concurrency

Load all `items/` and `loans/` into memory at startup (2000 small files ≈ instant). Every write goes to the in-memory map **and** to disk atomically (write `tmp`, then `rename`). Express is single-threaded, so there are no races between requests. One log line per change in `log.jsonl`. Filing a list is applied line by line, never as a transaction: a bad line is reported, the good ones stick. That is what the user expects from a paper list too.

## 4. Pages

One app page does nearly everything; the rest are small.

| URL                  | Who   | What                                                        |
|----------------------|-------|-------------------------------------------------------------|
| `/` (Checkout)       | all   | **Search + list.** Search box on top with instant local results (location, photo, quantity, **+**). Below it the list: textarea, scan button (camera overlay, each scan appends a line), verb buttons `find out in count new`, results under each line after filing. Text lines that match several items show the matches as buttons; tapping one swaps the line for the exact id. |
| `/items`             | all   | **The catalogue.** Everything, grouped by location (or tag, or flat), each row showing a picture of the thing: the product's photo, or the first of its numbered ones that has been photographed. Filter chips for sets / low stock / no photo / no location, and a summary of what still needs a location or a photo. This is where gaps in the data are visible, so it is also where they get fixed. **New item** adds one from a name and a quantity, staying open so a shelf's worth can be typed in one go. |
| `/locations`         | all   | **Places.** Locations (a cabinet, a bench) each holding shelves (a drawer, a level), both shown as a picture you can recognise. Both take a photo and a QR code. Rename a place and the text on every item filed there follows. |
| `/l/<id>`            | all   | A location or a shelf. Its photo, its QR, its shelves, and everything filed there. **Shelf QR codes point here**, so scanning a drawer lists what belongs in it. |
| `/i/<id>`            | all   | Item page: photos, location, quantity, who has it, QR, "add to list", history. One-tap fixes for everyone: retake location photo, set count, add tag. **QR codes point here**, so a phone camera app lands on it and one tap adds it to the list. |
| `/i/<id>/edit`       | admin | Edit fields, contents (for sets), take / upload photos (`<input capture>`) |
| `/loans`             | all   | **Checkouts.** Yours (everyone); all of them, with check in, for an admin. One card per checkout: who, the return date (overdue marked), its lines. Sort by return date, person or newest; optionally show returned ones. The borrower or an admin can move the return date. |
| `/u/<username>`      | self, admin | **A person.** What they have now (return date, days late), what they returned and when, and their history from the log. Linked from Users, Loans, Account and every name in a log. |
| `/overview`          | admin | **Overview.** Late loans by how many days, people with unreturned things, items that are out, places with things missing. Linked from Loans. |
| `/incomplete`        | admin | Sets with missing parts, `fix` button                       |
| `/labels?ids=a,b,c`  | all   | Printable A4 sheet of QR labels (QR + name + id + location). Items passes whatever the filters currently show, so a filter doubles as a selection. `?places=all` prints one for every shelf. |
| `/sticker?id=x`      | all   | One label drawn at 2:3 for a pocket sticker printer. Hands the image to the phone's share sheet, so it lands in the printer's own app. |
| `/login`             | all   | Username + password, or `?card=<uuid>` from a scanned card + password. A card whose user has no password yet asks them to choose one. Any write while logged out lands here and returns. |
| `/account`           | all   | Who you are, change password, log out. |
| `/users`             | admin | Add people (username, name, role), print their cards, rename, make admin, reset a password, replace a lost card, delete. |
| `/cards?ids=a,b`     | admin | Printable bank-card sized login cards: QR, name, username. |
| `/settings`          | all   | How to reach this instance right now: QR codes for the Wi-Fi address, the temporary public tunnel, or a configured address. Lab name, low-stock threshold, loan period. Item and photo counts, data folder. |
| `/help`              | all   | How to use Nerva, written for someone who has never seen it: log in, photograph the places, add the three kinds of item, take things out, bring them back, fix what is wrong. Cached offline like the other pages. |
| `/admin`             | admin | Export zip, CSV import                                      |

Mobile first: the main use is one hand holding a phone at the shelf. Everything on `/` works offline except pressing a verb.

## 5. API

Plain and curl-friendly. The text format is the API.

```
POST   /api/file?verb=out               body: text/plain (the list) or JSON { text }
                                        → { lines: [ { line, ok, message, item? } ] }
                                        anything else in the query is the verb's options:
                                        out takes &due=2026-10-01, in (admin) takes &checkout=C00007
GET    /api/items?q=                    search
GET    /api/items/:id                   a product, or one unit of it ("338va6-2")
POST   /api/items                       { name, quantity } create one
PUT    /api/items/:id                   { name, description, tags } only; never
                                        touches units, shelves, photos or counts
PUT    /api/items/:id/consumable        { consumable } gets used up: taking it makes no loan
PUT    /api/items/:id/tracked           { tracked } switch between quantity and numbered units
POST   /api/items/:id/units             { count } add numbered units
DELETE /api/items/:id/units/:n          retire one (refused while it is out)
DELETE /api/items/:id                   admin (refused while on loan or inside a set)
POST   /api/items/:id/photo?type=item|loc   raw image/jpeg body; type=item on a unit
                                        photographs that one, type=loc always the product
DELETE /api/items/:id/photo?type=item|loc
POST   /api/items/:id/count             { quantity } set the counted number
GET    /api/items/:id/history?limit=    the log for this item, newest first, with names filled in
GET    /api/places/:id/history          the log for a shelf, or a location and all its shelves
GET    /api/people/:username            { user, open, returned } loans; yourself ("me") or admin
GET    /api/people/:username/history    the log for a person; yourself or admin
GET    /api/overview                    admin: { totals, late, people, items, places }
PUT    /api/items/:id/shelf             { shelf } file it on a place; given a unit id
                                        this files that one, and null puts it back
                                        wherever the product says

GET    /api/locations                   locations with their shelves
POST   /api/locations                   { name }
PUT    /api/locations/:id               { name }  (rewrites item text)
DELETE /api/locations/:id               refused while things are filed there
POST   /api/locations/:id/shelves       { name }
PUT    /api/locations/:id/shelves/:n    { name }
DELETE /api/locations/:id/shelves/:n    refused while things are on it
GET    /api/places/:id                  a location or shelf, and what is on it
                                        (each numbered one listed separately)
POST   /api/places/:id/photo            raw image/jpeg body
GET    /api/places/:id/qr.svg           QR of https://<host>/l/<id>
GET    /api/items/:id/qr.svg            QR of https://<host>/i/<id> (also qr.png?w=512)
GET    /api/loans?open=1&mine=1         soonest due first, with name, whoName, outstanding, overdue
PUT    /api/checkouts/:id/due           { due } move the return date: the borrower, or an admin
POST   /api/login                       { username, password } or { card, password }; a card
                                        whose user has no password sets it
GET    /api/login/card/:card            { username, name, hasPassword } for the login page
POST   /api/logout
GET    /api/me                          { user } or { user: null }
PUT    /api/me/password                 { current, password }
GET    /api/users                       admin
POST   /api/users                       admin  { username, name, role }
PUT    /api/users/:id                   admin  { name, role }  (the username never changes)
POST   /api/users/:id/reset             admin  clear the password, end their sessions
POST   /api/users/:id/card              admin  new card code; the printed one stops working
DELETE /api/users/:id                   admin  (not the built-in admin, not yourself)
GET    /api/users/:id/card.svg          admin  QR of https://<host>/login?card=<uuid>
GET    /api/export.zip       admin
POST   /api/import.csv       admin
```

Identity for scripts: HTTP Basic auth with a username and password, or the cookie. So from a laptop:

```sh
curl -sS -u mari --data-binary @list.txt 'https://nerva.lab/api/file?verb=out'
```

A tiny `bin/nerva` CLI wraps this (`nerva out a7k3q9 b2x8`, `nerva find multimeter`, `nerva in - < list.txt`). Same parser, same server.

## 6. Identity: a card and a password

The lab is a trusted room, but the log should say who took what, and deleting things or managing people should not be open to anyone on the Wi-Fi.

1. **Built-in admin.** On first start the server creates the user `admin`, with no password, and prints a one-time link (`/login?card=<uuid>`) in the terminal. Opening it sets the admin password. Only whoever started the server sees it. The built-in admin can never be deleted or demoted, so the lab cannot lock itself out. Forgotten? Stop Nerva and run `npm run reset-admin` for a fresh link.
2. **The admin adds people** on `/users`: a username (fixed from then on, it is what the log remembers), a name, a role. Each gets a **card**: a random UUID, printed as a QR of `/login?card=<uuid>` on `/cards`.
3. **First login is by card.** The person scans their card with the phone camera and chooses a password. A username alone cannot set a first password, so knowing someone's username is not enough to claim their account.
4. **After that:** the username or the card, plus the password. The card replaces typing a name; it never replaces the password, so a lost card alone lets nobody in. A signed cookie (`HttpOnly`, HMAC with `SESSION_SECRET` or `data/session-secret`) keeps you logged in: it holds a session token, never the password, and every page load renews its year, so a phone or computer in use never asks again. Scanning your own card while logged in just opens Checkout.
5. **Fixes stay one tap.** Admin can reset a password (the card asks for a new one, all sessions end) or replace a lost card (the old one stops working). Changing your own password on `/account` logs out your other devices.
6. **What needs what.** Reading, searching, building the list and `find` need nobody. Every other write needs a login, and is logged under the username. Checking things in (`in`), deleting an item and managing users need admin. Keep the admin surface small: the lab lives on ordinary users fixing things as they go.

Passwords are `crypto.scrypt` with a random salt. A few wrong passwords for the same name from the same address mean a ten-minute wait. If the university ever demands its own login, `/login` is the page to swap for a Microsoft Entra ID redirect; everything else keys on `req.user` and stays the same.

## 7. Code layout: small modules an LLM can edit in one go

The rule: **one concern, one file, under ~150 lines, no clever sharing.** Adding a verb, page or field should mean touching one or two files that a coding agent can read in full.

```
server.js              starts Express, mounts routes, nothing else
lib/store.js           load/save JSON files, atomic writes, in-memory maps, log()
lib/parse.js           the list parser (also served to the browser as-is)
lib/who.js             signed cookie / basic auth identity, guardWrites, requireAdmin
lib/users.js           passwords, cards, the built-in admin
lib/net.js             which addresses this machine is reachable on
lib/units.js           bulk vs numbered units, unit ids
lib/places.js          locations, shelves, place ids
lib/loans.js           return dates, what is out, days late, checkout and loan numbers
lib/history.js         log.jsonl read back by item, by place, by person
lib/overview.js        the open loans counted by lateness, person, item and place
verbs/find.js          one file per verb, same signature:
verbs/out.js             module.exports = async (lines, who, store, opts) => results
verbs/in.js              (`module.exports.admin = true` makes a verb the admin's)
verbs/count.js
verbs/new.js
verbs/fix.js
routes/items.js        item read + delete
routes/units.js        numbering on/off, add and retire units
routes/count.js        counting a bulk item, and its history
routes/locations.js    locations, shelves, filing an item, place pages
routes/photos.js       photo upload and removal
routes/qr.js           qr.svg / qr.png and the label sheet
routes/settings.js     config, instance status, addresses
routes/file.js         POST /api/file → picks verbs/<verb>.js by name
routes/loans.js        who has what, moving a return date, the /loans page
routes/history.js      item / place / person history, the overview, /u/<username>, /overview
routes/login.js        log in by username or card, log out, /api/me, own password
routes/users.js        admin: users, cards, resets
routes/admin.js
public/app.css         every shared style, including the tab bar
public/app.js          shared browser helpers: cached catalogue, the list, nav, item rows
public/index.html      checkout: search + list (page-specific JS inline, no imports)
public/items.html      the catalogue: grouping, filter chips, data gaps
public/item.html       one item
public/loans.html      checkouts: yours, or all of them with check in for an admin
public/person.html     one person: has now, returned, history
public/overview.html   admin: late, people, items, places
public/log.js          renders log events the same way on every page
public/labels.html     print sheet
public/settings.html   addresses, lab settings, status
public/locations.html  locations and their shelves
public/place.html      one location or shelf, and what is on it
public/sticker.html    one 2x3" label for a pocket sticker printer
public/login.html      username or card, then password; first card scan sets it
public/account.html    change password, log out
public/users.html      admin: add people, print cards, reset
public/cards.html      printable login cards
public/paint.js        darken a photo and finger-paint the highlight
bin/tunnel.js          npm run phone: server + Cloudflare quick tunnel + QR
bin/reset-admin.js     npm run reset-admin: a fresh set-password link for the built-in admin
public/parse.js        symlink/copy of lib/parse.js
public/sw.js           service worker
bin/nerva              CLI, ~80 lines, calls POST /api/file
test/*.test.js         node:test, one file per verb, run with `node --test`
```

Conventions that make LLM edits safe:
- A new verb is one new file in `verbs/` plus one button in `index.html`. The router discovers verbs by filename, no registration list.
- Every verb function is pure over its inputs: takes parsed lines, `who`, the store and `opts` (the rest of the query string), returns `[ { line, ok, message } ]`. Tests call it with an in-memory store, no HTTP.
- No shared helpers beyond `lib/`. Duplication of five lines is preferred to an abstraction across modules.
- Item fields are optional everywhere. Adding a field is: read/write it in `routes/items.js`, show it in `item.html`. Old JSON files never need migrating.
- `CLAUDE.md` in the repo root repeats these rules for the agent.

## 8. Operations

- **Run:** `cp .env.example .env`, set `SESSION_SECRET`, `npm install`, `node server.js`, open the admin link it prints. Or `docker compose up`.
- **Try it on a phone before there is a server:** `npm run phone` starts the app, prints a QR for the Wi-Fi address, and asks Cloudflare for a temporary public HTTPS address (`cloudflared` quick tunnel), printing a QR for that too. The public address is written to `data/runtime.json` so QR labels use it, and cleared on exit. It is unauthenticated and changes every run: a test address, not a deployment. Networks that block `api.trycloudflare.com` get the Wi-Fi address only.
- **Address used by printed labels:** a live tunnel, else `BASE_URL`, else the host the request came in on. Set `BASE_URL` before printing labels for real.
- **HTTPS:** Caddy with two lines of config (`Caddyfile` provided). Needed because phone browsers only allow the camera on HTTPS.
- **Labels on a pocket sticker printer:** ZINK printers such as the Liene Pearl take photos over Bluetooth from their own app and speak no printing protocol, so nothing can print to them directly. `/sticker?id=x` draws the label at 2:3 and hands the PNG to the phone's share sheet (`navigator.share` with a file), from which you pick the printer's app; where sharing files is unavailable the image saves to the photo library instead. The paper is sticky-backed, so the print is the sticker. For a whole batch, the A4 sheet at `/labels` on ordinary sticker paper is far quicker.
- **Backup:** `data/` is the whole system. Nightly `rsync` or `zip` from cron, or the *Export* button in `/admin`.
- **Restore:** copy the folder back, restart.
- **Migrations:** none. New fields are optional; old JSON keeps working.
- **Upgrade:** `git pull && npm install && restart`.

## 9. Build order (each step is a shippable increment, sized for one LLM session)

1. ✅ **Lookup** – Express, JSON store with atomic writes, `/api/catalogue.json`, `/` with instant local search (location + photo + quantity), item page, `manifest.json` + service worker. No identity needed yet. Usable on day one for "which shelf".
1b. ✅ **List + find** – the textarea, shared parser in `lib/parse.js`, `verbs/find.js`, `POST /api/file`.
2. ✅ **Scan + QR + labels** – QR codes and the `/labels` print sheet for items, units and places; photos with client-side resize and finger-painted highlighting; numbered units; counting with history; locations and shelves; the camera overlay (`public/scan.js`: `BarcodeDetector`, `jsQR` where there is none) that appends each scanned label to the list.
3. ✅ **Identity + out/in** – users with passwords and printed QR login cards, the built-in admin, `/login`, `/account`, `/users`, writes gated on login; `out` with a confirm step and a return date, saved as a per-user checkout; things that get used up; admin-only `in`; `/loans`; what is out shown in search, the list and `find`; history on items, places and people, and the admin overview. `count` on Checkout shows a confirm step: each counted product with its old number and a box for the new one, then files the list as `[id] Name xN`.
4. **Sets** – contents editor, `- part xN` lines on `in`, `missing`, `/incomplete`, `fix`.
5. **new + admin** – ✅ creating items on the Items page, and correcting their name, description and tags; user management (step 3). Still to do: the `new` verb so a whole list of names becomes items at once, export zip, CSV import.
6. **Ops** – Dockerfile, Caddyfile, `bin/nerva` CLI, overdue list.

Optional later, only if wanted:
- LLM assist: photograph an item → suggest name/description/tags (one API call, behind a button on the edit page).
- Microsoft Entra ID replacing `/login`.
- Email reminder for overdue loans (one cron script).

## 10. Explicit non-goals

No multi-lab tenancy, no purchase orders, no barcode printers beyond a normal A4 printer, no realtime sync, no mobile app, no identity provider. If it needs more than one server process, it is out of scope.
