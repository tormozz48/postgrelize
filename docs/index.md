---
layout: home

hero:
  name: postgrelize
  text: The Sequelize v6 API, PostgreSQL only
  image:
    src: /logo.svg
    alt: postgrelize
  tagline: Drop-in for Sequelize v6 — plus upserts, MERGE, CTEs, COPY, LISTEN/NOTIFY and everything else PostgreSQL can do.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: PostgreSQL features
      link: /guide/upserts
    - theme: alt
      text: PostgreSQL coverage
      link: /postgresql-coverage
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: For LLMs
      link: /guide/llm

features:
  - title: Drop-in for Sequelize v6
    details: Models, queries, scopes, hooks, associations, transactions and QueryInterface behave like v6 — verified by differential tests that run every scenario on both libraries.
  - title: PostgreSQL first
    details: Expression upserts with ON CONFLICT, MERGE, UPDATE … FROM, CTEs, window functions, COPY streaming, LISTEN/NOTIFY, advisory locks, read replicas and RETURNING old values.
  - title: Fixes Sequelize bugs
    details: Dozens of open Sequelize issues on PostgreSQL work correctly here; each fix has a regression test.
  - title: Safe and typed
    details: Values are always bound parameters, identifiers quoted, operators allow-listed. Strict TypeScript with documentation on every export.
---
