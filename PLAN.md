# Nerva – plan

Stock management for the robotics lab at Narava University.
Goal: **ultra simple to run, ultra simple to manage.** One process, one folder of data, no database.

## 1. What it has to do

- Every product has: name, quantity, storage location, a **photo of the item**, a **photo of its default location**, and a **QR code**.
- Scanning the QR with any phone camera opens the item page.
- **Sets** (e.g. "Soldering set #3") are rented out and returned. On return the user ticks a checklist; anything missing is recorded, the set is flagged *incomplete*, and an admin replaces the missing parts from stock.
- Login with a **Microsoft account** (university Entra ID tenant). Two roles: `admin` (edit stock, replace parts) and `user` (browse, borrow, return).
- Scale: ≤ 2000 items, ~60 users, ~5 active at a time.

## 2. Architecture (deliberately boring)

```
browser (plain HTML + JS, no build step)
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
| Frontend      | Static HTML + vanilla JS, served by the same app  | No bundler, no framework upgrades            |
| Auth          | Microsoft Entra ID via OpenID Connect (`openid-client`) | University identity, no passwords to manage |
| Session       | Signed cookie (`cookie-session`)                  | No session store                             |
| Photos        | Resized **in the browser** (canvas, max 1280 px), uploaded as JPEG | No image libraries on the server |
| QR codes      | `qrcode` npm package, rendered on demand          | Nothing to store                             |
| Deployment    | `node server.js` behind Caddy, or the provided Dockerfile | One box, one command                  |

No database, no ORM, no Redis, no build pipeline. If something needs a second service, the answer is probably "no".

## 3. Data layout

```
data/
  config.json            # admin emails, lab name, loan period
  users.json             # { "<oid>": { email, name, role, lastLogin } }
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
  "missing": [ { "itemId": "tweez1", "qty": 1, "since": "2026-09-10", "loanId": "..." } ]
}
```

`missing` is non-empty ⇒ the set is *incomplete* and shown with a warning. Admin action **"Replace missing"** decrements the component item's `quantity` and clears the entry.

### Loan (`data/loans/<id>.json`)

```json
{
  "id": "L00042",
  "itemId": "s0ld3r",
  "qty": 1,
  "userId": "<entra-oid>",
  "userName": "Mari Maasikas",
  "borrowedAt": "2026-09-12T10:00:00Z",
  "dueAt": "2026-09-26T10:00:00Z",
  "returnedAt": null,
  "returnCheck": [ { "itemId": "tweez1", "expected": 2, "returned": 1 } ],
  "note": ""
}
```

### Concurrency

Load all `items/` and `loans/` into memory at startup (2000 small files ≈ instant). Every write goes to the in-memory map **and** to disk atomically (write `tmp`, then `rename`). Express is single-threaded, so there are no races between requests. One log line per change in `log.jsonl`.

## 4. Pages

| URL                  | Who   | What                                                        |
|----------------------|-------|-------------------------------------------------------------|
| `/`                  | all   | Search box + list (name, qty, location thumbnail). Filters: sets / low stock / incomplete |
| `/i/<id>`            | all   | Item page: photos, location, quantity, QR, borrow button, history. **QR codes point here.** |
| `/i/<id>/edit`       | admin | Edit fields, upload / retake photos (phone camera works via `<input capture>`) |
| `/new`               | admin | Create item or set                                           |
| `/return`            | all   | My open loans → return → checklist for sets                 |
| `/loans`             | admin | All open loans, overdue highlighted                         |
| `/incomplete`        | admin | Sets with missing parts → "Replace from stock"              |
| `/labels?ids=a,b,c`  | admin | Printable sheet of QR labels (name + id + QR), A4 grid       |
| `/scan`              | all   | In-browser QR scanner (`BarcodeDetector`, falls back to "use your camera app") |
| `/admin`             | admin | Users & roles, export/backup (zip of `data/`), CSV import    |

Everything is mobile-first: the main use is a phone at the shelf.

## 5. API (JSON, all under `/api`, session cookie required)

```
GET    /api/items?q=&kind=&tag=          list / search
GET    /api/items/:id
POST   /api/items                        admin
PUT    /api/items/:id                    admin
DELETE /api/items/:id                    admin (refused if open loans)
POST   /api/items/:id/photo?type=item|loc   admin, multipart JPEG
GET    /api/items/:id/qr.png             PNG of https://<host>/i/<id>
POST   /api/items/:id/replace-missing    admin, body: { itemId, qty }

POST   /api/loans                        { itemId, qty }  → borrow
POST   /api/loans/:id/return             { returnCheck: [...] }
GET    /api/loans?open=1&mine=1

GET    /api/me
GET    /api/users            admin
PUT    /api/users/:id        admin  { role }
GET    /api/export.zip       admin
POST   /api/import.csv       admin
```

## 6. Auth flow (Microsoft Entra ID)

1. Register an app in the university Entra tenant: *Web* platform, redirect URI `https://<host>/auth/callback`, create a client secret. Note tenant ID, client ID, secret.
2. `GET /auth/login` → redirect to Microsoft (`openid-client`, scopes `openid profile email`).
3. `GET /auth/callback` → verify ID token, upsert `users.json[oid]`, set signed cookie `{ oid, name, email, role }`.
4. Role: `admin` if the email is in `config.json.adminEmails` or the user was promoted in `/admin`; otherwise `user`.
5. `GET /auth/logout` clears the cookie.
6. `DEV_USER=someone@example.com npm run dev` bypasses Microsoft locally so development never needs the tenant.

## 7. Operations

- **Run:** `cp .env.example .env`, fill in three Microsoft values, `npm install`, `node server.js`. Or `docker compose up`.
- **HTTPS:** Caddy with two lines of config (`Caddyfile` provided). Required anyway because phone cameras only open camera on HTTPS.
- **Backup:** `data/` is the whole system. Nightly `rsync` or `zip` from cron, or the *Export* button in `/admin`.
- **Restore:** copy the folder back, restart.
- **Migrations:** none. New fields are optional; old JSON keeps working.
- **Upgrade:** `git pull && npm install && restart`.

## 8. Build order (each step is a shippable increment, sized for one LLM session)

1. **Skeleton** – Express, static pages, JSON store with atomic writes, `DEV_USER` auth, item CRUD, search page, item page.
2. **Photos + QR** – client-side resize + upload, `/api/items/:id/qr.png`, `/labels` print sheet.
3. **Loans** – borrow / return, my loans, admin loan list, overdue.
4. **Sets** – contents editor, return checklist, `missing`, `/incomplete`, replace-from-stock.
5. **Microsoft login** – `openid-client`, roles, `/admin` user list.
6. **Ops polish** – Dockerfile, Caddyfile, export zip, CSV import, `/scan` page.

Optional later, only if wanted:
- LLM assist: photograph an item → suggest name/description/tags (one API call, behind a button).
- Email reminder for overdue loans (one cron script, `nodemailer`).

## 9. Explicit non-goals

No multi-lab tenancy, no purchase orders, no barcode printers beyond a normal A4 printer, no realtime sync, no mobile app. If it needs more than one server process, it is out of scope.
