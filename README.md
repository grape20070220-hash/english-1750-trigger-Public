# English 1750 Trainer

PWA vocabulary trainer for the 1,750-item daily/business English list.

- GitHub Pages: HTTPS/PWA hosting
- Neon Data API: restricted RPC for push subscription and review-schedule sync
- GitHub Actions: checks review deadlines every 5 minutes and sends Web Push
- Browser localStorage: detailed learning history

Required repository secret: `DATABASE_URL` (pooled Neon Postgres connection string).
