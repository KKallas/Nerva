# Nerva

Ultra-simple stock management for the robotics lab at Narava University.

Need M5 bolts? Open Nerva, type `m5`, see the drawer and a photo of it. Beyond lookup, the whole system is two moves: **make a list** by scanning QR codes (plain text, offline, no login), then **file it** with one verb: `find`, `out`, `in`, `count`, `new`.

- Every item has a photo, a photo of where it lives, and a QR code that opens its page.
- Locations and shelves are records of their own, each with a photo and a QR. Scan a drawer to see what belongs in it.
- Numbered things list every unit with its QR, highlighting the one you just scanned.
- Labels print as an A4 sheet, or one at a time to a 2x3" pocket sticker printer through the phone's share sheet.
- Photos can be darkened and finger-painted, so a picture of a full shelf still says which thing is meant.
- Bolts are a box with a quantity and one QR. An oscilloscope or a soldering set is numbered instead, so each physical one carries its own QR at `<id>-1`, `<id>-2`, and can be lent out on its own.
- Sets (e.g. soldering sets) are lent out and checked back in; missing parts are noted on the same list and replaced from stock.
- People log in with a username or their printed QR card, plus a password. A built-in admin adds users and prints their cards; the first scan of a card asks for a password. No identity provider.
- No database. One Node process, all state lives in the `data/` folder. Backup = copy the folder.
- The text list is also the API, so `curl` and a tiny CLI work the same as the web page.

Read [PLAN.md](PLAN.md) for the list format, design, data layout, pages, API and build order.

## Quick start

```sh
cp .env.example .env      # defaults are fine for local testing
npm install
npm run seed              # 33 sample items and 3 soldering sets, only if data/ is empty
npm start                 # http://localhost:3000, and prints a link to set the admin password
npm run dev               # the same, restarting itself whenever a file changes
npm test                  # unit tests for parser, search, store, verbs
```

To use it from your phone before there is a server anywhere:

```sh
npm run phone      # stop `npm start` first, or use PORT=3001 npm run phone
```

That starts Nerva and prints a QR code for the Wi-Fi address, so a phone on the
same network can scan and start straight away. In parallel it asks Cloudflare
for a temporary public HTTPS address (`cloudflared` quick tunnel) and prints a
second QR if one comes up, which also works off the lab network. Both addresses,
with their QR codes, are on the Settings page. The public one is unauthenticated
and changes on every run, so treat it as a test address and do not print labels
from it.

The first start creates the built-in `admin` and prints a link that sets its
password. Log in, open your name in the tab bar, then **Manage users** to add
people and print their login cards. Lost the admin password? Stop Nerva and run
`npm run reset-admin`. Looking things up never needs a login; changing anything
does, and deleting items or managing users needs an admin. Scripts log in with
`curl -u username`.

Items are added on the Items page: a name, how many, and it is in. Everything
else about an item comes from doing something to it, so counting sets the
quantity, filing sets the place, and photographing sets the picture.

## Hosting

A small Ubuntu server is enough: Node 22 runs Nerva as a systemd service
(`nerva`) from `/opt/nerva`, with `DATA_DIR=/var/lib/nerva` so a deploy can never
touch the data, and Caddy in front for HTTPS. Set `BASE_URL` in the server's
`.env` to the permanent address so printed labels keep working. To ship the
working tree by hand: `bin/deploy.sh [user@host]` (runs the tests, copies the
code, restarts the service). Every push to `main` does the same through GitHub
Actions (`.github/workflows/deploy.yml`): tests first, then rsync over SSH as a
`deploy` user that owns only the code and may only restart the service; the
private key is the `DEPLOY_SSH_KEY` repository secret. Everything worth backing
up is in `DATA_DIR`.

## Status

Working today: instant offline search, the Checkout and Items pages, item pages, the text list with the `find`, `out`, `in` and `count` verbs, scanning labels with the phone camera, QR codes and printable labels, item and location photos taken from a phone, logins with printed cards, loans and history, and deleting items.

Checking out: build a list, press **out**, confirm it with a return date. It is saved as a checkout under your name and shows on **Loans**. Anything already out says so, with its return date, while you build the list. Things that get used up (bolts, glue, tape) are marked so on their page and never become a loan. Checking in is done by an admin on the Loans page, which lists every checkout and sorts by return date.

History: every item page shows where it has been filed, who checked it out and who checked it in; every location and shelf shows what was put there and taken from there, and by whom; every person has a page with what they hold, what they returned and when. Admins get an **Overview** (from Loans): what is late and by how many days, who still has things, which places have things missing.

Try from a terminal:

```sh
printf 'multimeter\nm5 bolt\n' | curl -s --data-binary @- 'http://localhost:3000/api/file?verb=find'
```

Next: sets with missing parts, and the `new` verb. See the build order in [PLAN.md](PLAN.md).

## License

MIT, see [LICENSE](LICENSE).
