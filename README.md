# Nerva

Ultra-simple stock management for the robotics lab at Narava University.

- Every item has a photo, a photo of where it lives, and a QR code that opens its page.
- Sets (e.g. soldering sets) are lent out and checked back in with a checklist; missing parts are replaced from stock.
- Login with the university Microsoft account. Two roles: admin and user.
- No database. One Node process, all state lives in the `data/` folder. Backup = copy the folder.

Read [PLAN.md](PLAN.md) for the design, data layout, pages, API and build order.

## Quick start (once implemented)

```sh
cp .env.example .env      # fill in the Microsoft values, or set DEV_USER for local dev
npm install
npm start                 # http://localhost:3000
```

## Status

Planning. Implementation follows the build order in PLAN.md, step 1 first.

## License

MIT, see [LICENSE](LICENSE).
