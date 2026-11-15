import { defineConfig } from 'vitepress';
import apiSidebar from '../api/typedoc-sidebar.json' with { type: 'json' };

const guide = [
  {
    text: 'Introduction',
    items: [
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Migrating from Sequelize', link: '/guide/migrating' },
    ],
  },
  {
    text: 'Sequelize v6 API',
    items: [
      { text: 'Models and data types', link: '/guide/models' },
      { text: 'Querying', link: '/guide/querying' },
      { text: 'Associations', link: '/guide/associations' },
      { text: 'Decorators', link: '/guide/decorators' },
      { text: 'Transactions', link: '/guide/transactions' },
      { text: 'Hooks and validation', link: '/guide/hooks-validation' },
      { text: 'Schema, sync and migrations', link: '/guide/schema' },
    ],
  },
  {
    text: 'PostgreSQL features',
    items: [
      { text: 'Upserts and RETURNING', link: '/guide/upserts' },
      { text: 'Bulk writes and COPY', link: '/guide/bulk-writes' },
      { text: 'Advanced queries', link: '/guide/advanced-queries' },
      { text: 'Sessions and scaling', link: '/guide/sessions' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'PostgreSQL coverage', link: '/postgresql-coverage' },
      { text: 'Security', link: '/security' },
      { text: 'Sequelize issues fixed', link: '/sequelize-issues' },
      { text: 'API reference', link: '/api/' },
      { text: 'Coverage report', link: 'https://tormozz48.github.io/postgrelize/coverage/' },
    ],
  },
];

export default defineConfig({
  title: 'postgrelize',
  description: 'PostgreSQL-only ORM with the Sequelize v6 API',
  base: '/postgrelize/',
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['examples/**'],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'PostgreSQL features', link: '/guide/upserts' },
      { text: 'API', link: '/api/' },
      { text: 'Fixed issues', link: '/sequelize-issues' },
    ],
    sidebar: {
      '/guide/': guide,
      '/sequelize-issues': guide,
      '/security': guide,
      '/postgresql-coverage': guide,
      '/api/': [{ text: 'API reference', items: apiSidebar }],
    },
    search: { provider: 'local' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/tormozz48/postgrelize' }],
    editLink: {
      pattern: 'https://github.com/tormozz48/postgrelize/edit/main/docs/:path',
    },
    footer: { message: 'Released under the MIT License.' },
  },
});
