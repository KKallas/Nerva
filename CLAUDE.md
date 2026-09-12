# Nerva – notes for AI coding agents

Read PLAN.md before changing anything. It is the spec.

Rules that keep this project simple:
- Plain Node 22 + Express. No TypeScript, no bundler, no framework on the frontend, no database.
- State = files in `data/`. One JSON per item/loan, atomic write (tmp + rename), in-memory map loaded at startup.
- Keep the dependency list tiny: express, cookie-session, openid-client, multer, qrcode, dotenv. Ask before adding anything else.
- Photos are resized in the browser before upload. The server just saves bytes.
- Mobile first. Every page must work on a phone at the shelf.
- `DEV_USER=...` must always allow running without Microsoft.
- Follow the build order in PLAN.md section 8. Finish a step fully (page + API + test) before starting the next.
- Never commit `data/` or `.env`.
