# Nerva – notes for AI coding agents

Read PLAN.md before changing anything. It is the spec.

Rules that keep this project simple:
- The list is the product. Plain text, one line per item, parsed by ONE shared parser used by the web page, the API and the CLI. Never invent a second input path.
- Plain Node 22 + Express. No TypeScript, no bundler, no framework on the frontend, no database.
- State = files in `data/`. One JSON per item/loan, atomic write (tmp + rename), in-memory map loaded at startup.
- Filing applies line by line and reports per line. Good lines stick, bad lines are returned for retry. No transactions.
- Identity is the signed email cookie or the `X-Who` header. No passwords, no OAuth unless the user asks.
- Keep the dependency list tiny: express, cookie-session, multer, qrcode, dotenv. Ask before adding anything else.
- Photos are resized in the browser before upload. The server just saves bytes.
- Code layout is PLAN.md section 7: one concern per file, under ~150 lines. A verb is one file in `verbs/` with the signature `async (lines, who, store) => results`, discovered by filename. Tests in `test/` call verbs directly with an in-memory store.
- `/` is first of all a lookup tool: search box on top, instant, local, offline. Never make search wait on the server.
- Mobile first. `/` must work one-handed on a phone at the shelf, offline except for pressing a verb.
- Follow the build order in PLAN.md section 9. Finish a step fully (page + API + test) before starting the next.
- Never commit `data/` or `.env`.
