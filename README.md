# postgrelize

PostgreSQL-only ORM for Node.js with a public API compatible with [Sequelize v6](https://sequelize.org/docs/v6/), plus first-class PostgreSQL features (advanced `INSERT ... ON CONFLICT`, and more).

> Status: early development (milestone M0 — tooling). Not usable yet.

## Install

The package is published to GitHub Packages. Add to `.npmrc`:

```
@tormozz48:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install, optionally aliased to keep `import ... from 'postgrelize'`:

```bash
npm install postgrelize@npm:@tormozz48/postgrelize pg
```

## Development

```bash
npm ci
npm run db:up        # PostgreSQL 16 in Docker on port 54329
npm run lint && npm run format:check && npm run typecheck
npm test             # unit + integration + compat
npm run build && npm run test:build
npm run docs         # API docs into docs-site/
```

Set `PGZ_TEST_URL` to use another database. `PGZ_PG_VERSION=17 npm run db:up` starts another PostgreSQL version.

## License

MIT
