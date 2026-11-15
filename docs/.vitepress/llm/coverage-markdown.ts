import {
  AREAS,
  POSTGRESQL_FEATURES,
  type FeatureRow,
} from '../../coverage/postgresql-features.ts';

const STATUS_LABEL: Record<FeatureRow['status'], string> = {
  supported: 'supported',
  literal: 'via literal() / raw SQL',
  planned: 'planned (use raw SQL)',
  'out-of-scope': 'out of scope',
};

/** Renders the PostgreSQL coverage matrix as markdown, for `llms-full.txt` and the LLM guides. */
export class CoverageMarkdown {
  /** The full matrix, one table per area. */
  full(): string {
    return AREAS.map((area) => {
      const rows = POSTGRESQL_FEATURES.filter((row) => row.area === area).map(
        (row) =>
          `| ${row.feature} | ${STATUS_LABEL[row.status]} | PG ${row.minPg}+ | ${row.note.replaceAll('|', '\\|')} |`,
      );
      return `### ${area}\n\n| Feature | Status | Since | Note |\n| --- | --- | --- | --- |\n${rows.join('\n')}`;
    }).join('\n\n');
  }

  /** Features that are not implemented (planned) or never will be, grouped by area. */
  unsupported(): string {
    const missing = POSTGRESQL_FEATURES.filter(
      (row) => row.status === 'planned' || row.status === 'out-of-scope',
    );
    return AREAS.map((area) => {
      const names = missing.filter((row) => row.area === area).map((row) => row.feature);
      return names.length === 0 ? '' : `- **${area}**: ${names.join('; ')}`;
    })
      .filter((line) => line !== '')
      .join('\n');
  }
}
