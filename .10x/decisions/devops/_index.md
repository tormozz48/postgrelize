# DevOps — Index

GitHub Actions only. Registry: GitHub Packages. Docs: GitHub Pages. See [postgrelize-mvp](postgrelize-mvp.md).

## Coverage publishing (backlog 2 / S1, 2026-11-14)
- `docs.yml` runs `npm run test:coverage` against a PostgreSQL 18 service on every push to `main` and publishes `coverage/` (HTML report + `badge.json` in shields.io endpoint format) under `/coverage/` on GitHub Pages next to the API docs. No third-party coverage service.
- Badge thresholds (lines): ≥90 brightgreen, ≥80 green, ≥70 yellow, else red (`scripts/coverage-badge.mjs`).
