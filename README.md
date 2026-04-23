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

Build static assets with `npm run build`; host on Netlify, Vercel, or GitHub Pages. Set the same `VITE_*` env vars in the host’s dashboard.

## Rules

The included `firestore.rules` are permissive for authenticated users—good for an internal workshop. Lock these down (host-only writes, member-only own doc) before wider exposure.
