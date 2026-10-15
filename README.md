# Fund Tracker

TypeScript monorepo on Google/Firebase: React UI, Cloud Functions backend, Firestore, Gemini via Vertex AI.

```
web/              React + Vite UI (Firebase Hosting)
functions/        Cloud Functions (callables, services, config)
packages/shared/  zod schemas + shared types
docs/             BOUNDARY_CONDITIONS.md, ARCHITECTURE.md
CLAUDE.md         Coding standards & instructions (read first)
```

## Getting started

```bash
nvm use            # Node 22
npm install
npm run check      # format + lint + typecheck + tests
npm run build
```

## Firebase setup (one-time)

1. Create a Firebase project (Blaze plan, required for Functions/Vertex); enable Auth, Firestore, App Check, and the Vertex AI API.
2. Put its ID in `.firebaserc`.
3. `npx firebase login`, then `npm run emulators` to develop locally.
4. Copy `web/.env.example` to `web/.env.local` and fill in the web app config.
5. Deploy: `npm run build && npx firebase deploy`.

See `CLAUDE.md` for standards and `docs/BOUNDARY_CONDITIONS.md` for edge cases that must be handled.
