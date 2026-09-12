# Nerva

Ultra-simple stock management for the robotics lab at Narava University.

Need M5 bolts? Open Nerva, type `m5`, see the drawer and a photo of it. Beyond lookup, the whole system is two moves: **make a list** by scanning QR codes (plain text, offline, no login), then **file it** with one verb: `find`, `out`, `in`, `count`, `new`.

- Every item has a photo, a photo of where it lives, and a QR code that opens its page.
- Sets (e.g. soldering sets) are lent out and checked back in; missing parts are noted on the same list and replaced from stock.
- Identity is an email you type once, kept in a cookie. No passwords, no identity provider.
- No database. One Node process, all state lives in the `data/` folder. Backup = copy the folder.
- The text list is also the API, so `curl` and a tiny CLI work the same as the web page.

Read [PLAN.md](PLAN.md) for the list format, design, data layout, pages, API and build order.

## Quick start (once implemented)

```sh
cp .env.example .env      # set SESSION_SECRET and ADMIN_EMAILS
npm install
npm start                 # http://localhost:3000
```

## Status

Planning. Implementation follows the build order in PLAN.md, step 1 first.

## License

MIT, see [LICENSE](LICENSE).
