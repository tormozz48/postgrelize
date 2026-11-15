---
outline: false
---

<script setup>
import { computed, ref } from 'vue';
import { AREAS, POSTGRESQL_FEATURES } from './coverage/postgresql-features.ts';

const STATUS_LABELS = {
  supported: 'Supported',
  literal: 'Via literal / raw',
  planned: 'Planned',
  'out-of-scope': 'Out of scope',
};

const status = ref('all');
const area = ref('all');
const query = ref('');

const counts = computed(() =>
  Object.keys(STATUS_LABELS).map((key) => ({
    key,
    label: STATUS_LABELS[key],
    count: POSTGRESQL_FEATURES.filter((row) => row.status === key).length,
  })),
);

const groups = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return AREAS.map((name) => ({
    name,
    rows: POSTGRESQL_FEATURES.filter(
      (row) =>
        row.area === name &&
        (area.value === 'all' || area.value === name) &&
        (status.value === 'all' || row.status === status.value) &&
        (needle === '' || `${row.feature} ${row.note}`.toLowerCase().includes(needle)),
    ),
  })).filter((group) => group.rows.length > 0);
});
</script>

# PostgreSQL coverage

What postgrelize does with PostgreSQL 16–18 features, row by row. The list is checked against the repository: every **Supported** row names a test that exercises it, and CI fails when that test goes missing.

| Status            | Meaning                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Supported         | A dedicated API exists and a test in this repository runs it against PostgreSQL.            |
| Via literal / raw | Works through `literal()`, `fn()`, a raw `sequelize.query()` or a driver option; no helper. |
| Planned           | A real gap an ORM should cover. Not implemented yet; the note shows the workaround.         |
| Out of scope      | Server administration or internals. The note gives the reason.                              |

<div class="cov-summary">
  <button v-for="item in counts" :key="item.key" :class="['cov-chip', item.key, { active: status === item.key }]" @click="status = status === item.key ? 'all' : item.key">
    <strong>{{ item.count }}</strong> {{ item.label }}
  </button>
</div>

<div class="cov-filters">
  <input v-model="query" type="search" placeholder="Filter features…" aria-label="Filter features" />
  <select v-model="area" aria-label="Area">
    <option value="all">All areas</option>
    <option v-for="name in AREAS" :key="name" :value="name">{{ name }}</option>
  </select>
</div>

<section v-for="group in groups" :key="group.name">
  <h2 :id="group.name.toLowerCase().replace(/[^a-z]+/g, '-')">{{ group.name }}</h2>
  <table class="cov-table">
    <thead><tr><th>Feature</th><th>PG</th><th>Status</th><th>Notes</th></tr></thead>
    <tbody>
      <tr v-for="row in group.rows" :key="row.feature">
        <td>{{ row.feature }}</td>
        <td>{{ row.minPg }}+</td>
        <td><span :class="['cov-badge', row.status]">{{ STATUS_LABELS[row.status] }}</span></td>
        <td>{{ row.note }}</td>
      </tr>
    </tbody>
  </table>
</section>

<p v-if="groups.length === 0">No feature matches the filter.</p>

## Closing the gaps

The rows marked **Planned** are grouped into proposed stages in the [coverage review](https://github.com/tormozz48/postgrelize/blob/main/.10x/reviews/2026-11-15-pg-coverage-matrix.md). To add or change a row, edit `docs/coverage/postgresql-features.ts`; a row becomes **Supported** only together with a test reference.

<style>
.cov-summary { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
.cov-chip { border: 1px solid var(--vp-c-divider); border-radius: 16px; padding: 4px 12px; background: var(--vp-c-bg-soft); cursor: pointer; color: var(--vp-c-text-1); }
.cov-chip.active { border-color: var(--vp-c-brand-1); }
.cov-filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.cov-filters input, .cov-filters select { border: 1px solid var(--vp-c-divider); border-radius: 6px; padding: 6px 10px; background: var(--vp-c-bg); color: var(--vp-c-text-1); }
.cov-filters input { flex: 1 1 220px; }
.cov-table td:nth-child(2) { white-space: nowrap; }
.cov-badge { display: inline-block; border-radius: 10px; padding: 1px 8px; font-size: 12px; white-space: nowrap; font-weight: 600; }
.cov-badge.supported { background: rgba(34, 160, 90, 0.18); color: var(--vp-c-green-1); }
.cov-badge.literal { background: rgba(60, 120, 230, 0.18); color: var(--vp-c-indigo-1); }
.cov-badge.planned { background: rgba(230, 160, 20, 0.2); color: var(--vp-c-yellow-1); }
.cov-badge.out-of-scope { background: var(--vp-c-default-soft); color: var(--vp-c-text-2); }
</style>
