import { defineConfig } from 'vitepress';
import apiSidebar from '../api/typedoc-sidebar.json' with { type: 'json' };
import { LlmsWriter } from './llm/write-llms.ts';

const guide = [
  {
    text: 'Introduction',
    items: [
      { text: 'Getting started', link: '/guide/getting-started' },
      { text: 'Migrating from Sequelize', link: '/guide/migrating' },
      { text: 'Using with LLMs and agents', link: '/guide/llm' },
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
      { text: 'Schema objects', link: '/guide/schema-objects' },
      { text: 'Constraints and indexes', link: '/guide/constraints-indexes' },
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
      { text: 'Performance', link: '/guide/performance' },
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
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/postgrelize/favicon.svg' }],
    ['link', { rel: 'icon', sizes: '48x48', href: '/postgrelize/favicon.ico' }],
    ['link', { rel: 'apple-touch-icon', href: '/postgrelize/apple-touch-icon.png' }],
    ['link', { rel: 'manifest', href: '/postgrelize/site.webmanifest' }],
    ['meta', { name: 'theme-color', content: '#4f46e5' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'postgrelize' }],
    [
      'meta',
      { property: 'og:description', content: 'PostgreSQL-only ORM with the Sequelize v6 API' },
    ],
    ['meta', { property: 'og:image', content: 'https://tormozz48.github.io/postgrelize/og.png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:image', content: 'https://tormozz48.github.io/postgrelize/og.png' }],
  ],
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ['examples/**', 'llm/**', 'maintainers-npm-setup.md'],
  buildEnd: (siteConfig) => {
    new LlmsWriter(siteConfig.srcDir, siteConfig.outDir).write();
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'PostgreSQL features', link: '/guide/upserts' },
      { text: 'API', link: '/api/' },
      { text: 'Fixed issues', link: '/sequelize-issues' },
      { text: 'Changelog', link: '/changelog' },
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
