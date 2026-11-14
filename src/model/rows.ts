import type { QueryResultRow } from 'pg';
import type { ModelDefinition } from './definition.ts';

/**
 * Converts a driver row into attribute values: maps column names to attribute names (when the
 * query did not alias them) and applies data type parsers. Unknown columns are kept as is.
 */
export const parseRow = (
  definition: ModelDefinition,
  row: QueryResultRow,
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const name = definition.attributes.has(key)
        ? key
        : (definition.fieldToAttribute.get(key) ?? key);
      const parse = definition.attributes.get(name)?.type.parse;
      return [name, parse === undefined || value === null ? value : parse(value)];
    }),
  );
