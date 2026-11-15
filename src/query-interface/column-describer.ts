import type { ColumnDescription } from './query-interface-types.ts';
import type { StatementRows } from './statement-runner.ts';

/**
 * Converts `describeTable` catalog rows into Sequelize v6 column descriptions.
 *
 * @internal
 */
export class ColumnDescriber {
  /**
   * Column descriptions keyed by column name.
   *
   * @param rows - Rows of the `describeTable` query.
   * @returns Column descriptions.
   */
  describe(rows: StatementRows): Record<string, ColumnDescription> {
    return Object.fromEntries(rows.map((row) => [String(row['Field']), this.#column(row)]));
  }

  #column(row: Readonly<Record<string, unknown>>): ColumnDescription {
    const type = String(row['Type']).toUpperCase();
    return {
      type,
      allowNull: row['Null'] === 'YES',
      defaultValue: this.#cleanDefault(type, row['Default']),
      comment: (row['Comment'] as string | null) ?? null,
      special: this.#parseArray(row['special']),
      primaryKey: row['Constraint'] === 'PRIMARY KEY',
    };
  }

  #parseArray(value: unknown): readonly string[] {
    return Array.isArray(value)
      ? value.map(String)
      : typeof value === 'string' && value.startsWith('{')
        ? value
            .slice(1, -1)
            .split(',')
            .filter((item) => item !== '')
            .map((item) => item.replace(/^"(.*)"$/, '$1'))
        : [];
  }

  #cleanDefault(type: string, value: unknown): unknown {
    if (type === 'BOOLEAN') {
      return value === 'true' ? true : value === 'false' ? false : null;
    }
    if (typeof value !== 'string') {
      return value;
    }
    const literal = /^'((?:[^']|'')*)'(?:::[\w ."[\]]+)*$/.exec(value);
    if (literal !== null) {
      return (literal[1] ?? '').replaceAll("''", "'");
    }
    const unquoted = value.replaceAll("'", '');
    const [head, tail] = unquoted.split('::');
    return tail !== undefined && tail.toLowerCase() !== 'regclass)' ? head : unquoted;
  }
}
