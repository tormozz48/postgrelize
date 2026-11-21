export interface SurfaceEntry {
  name: string;
  category: string;
  note: string;
}

export type SurfaceExceptions = Record<string, SurfaceEntry[] | string>;

export const START_MARKER = '<!-- api-differences:start -->';
export const END_MARKER = '<!-- api-differences:end -->';

const LABELS: Record<string, string> = {
  'not-planned': 'Not planned',
  'other-dialect': 'Other dialects only',
  internal: 'v6 internals',
  'tracked-in-issue': 'Not yet available',
};

const SURFACES: Record<string, string> = {
  Sequelize: '`Sequelize` statics',
  'Sequelize.prototype': '`Sequelize` instance',
  Model: '`Model` statics',
  'Model.prototype': '`Model` instance',
  Transaction: '`Transaction` statics',
  'Transaction.prototype': '`Transaction` instance',
  'QueryInterface.prototype': '`QueryInterface`',
  DataTypes: '`DataTypes`',
  exports: 'Module exports',
};

export function renderApiDifferences(exceptions: SurfaceExceptions): string {
  const rows: string[] = [];
  for (const [surface, label] of Object.entries(SURFACES)) {
    const entries = exceptions[surface];
    if (!Array.isArray(entries)) continue;
    for (const category of Object.keys(LABELS)) {
      const names = entries
        .filter((entry) => entry.category === category)
        .map((entry) => `\`${entry.name}\``);
      if (names.length > 0) rows.push(`| ${label} | ${LABELS[category]} | ${names.join(', ')} |`);
    }
  }
  const table =
    rows.length === 0
      ? 'No differences are listed.'
      : ['| Surface | Status | Names |', '| --- | --- | --- |', ...rows].join('\n');
  return `${START_MARKER}\n${table}\n${END_MARKER}`;
}
