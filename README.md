# Vibe Coding Recess — workshop room

Multi-round facilitator flow: **Round 1** (structured prompts + timer), **Round 2** (everyone gets someone else’s prompt — derangement), **Round 3** (presentation order, then one-shot guesses for every other player), then **reveal** (true prompt on top, every guess with names, **green = word match** with the real prompt), and only when the group is ready the host shows **podium + full standings**. A sticky **your points** bar is always visible; totals fill in after the host opens **Reveal**.

Music and screen sharing stay in **Teams**; this app handles room state and scoring.

## Setup

1. Create a [Firebase](https://console.firebase.google.com/) project.
2. Enable **Authentication** → **Anonymous** sign-in.
3. Create **Firestore** (start in test mode for local dev, then deploy rules from `firestore.rules` when ready).
4. Project settings → Your apps → Web → copy config into `.env` (see `.env.example`).

```bash
cp .env.example .env
# edit .env
npm install
npm run dev
```

## Deploy

### GitHub Pages (this repo)

1. **Repository → Settings → Secrets and variables → Actions** → **New repository secret** and add the same six keys you use locally (names must match exactly):
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`
2. **Settings → Pages** → **Build and deployment** → Source: **GitHub Actions** (not “Deploy from a branch” only).
3. Push to `main`. The **Deploy to GitHub Pages** workflow builds with `VITE_BASE_PATH=/vibe-coding-recess` (see `vite.config.ts`); your site is at `https://<your-username>.github.io/vibe-coding-recess/`
4. In **Firebase** → **Authentication** → **Settings** → **Authorized domains**, add `your-username.github.io` so anonymous sign-in works on Pages.

**Other hosts:** `npm run build` outputs `dist/`. Set the same `VITE_*` vars. For a root URL, do **not** set `VITE_BASE_PATH` (or set `/`). For a subpath, set `VITE_BASE_PATH` to that path in the build environment.

## Rules

The included `firestore.rules` are permissive for authenticated users—good for an internal workshop. Lock these down (host-only writes, member-only own doc) before wider exposure.
