import { describe, expect, it } from 'vitest';
import { IncludeRows } from '../../../src/associations/include-rows.ts';
import type { ModelDefinition } from '../../../src/model/model-definition.ts';

const definition = (primaryKeys: string[], parsed: string[] = []): ModelDefinition =>
  ({
    primaryKeys,
    attributes: new Map(
      parsed.map((name) => [
        name,
        { type: { parse: (value: unknown) => `parsed:${String(value)}` } },
      ]),
    ),
  }) as unknown as ModelDefinition;

describe('IncludeRows.identity', () => {
  const rows = new IncludeRows();

  it('uses a numeric single primary key directly', () => {
    expect(rows.identity(definition(['id']), { id: 7, name: 'a' })).toBe(7);
  });

  it('tells equal-looking keys of different types apart', () => {
    const keys = definition(['id']);
    expect(rows.identity(keys, { id: '7' })).not.toBe(rows.identity(keys, { id: 7 }));
  });

  it('joins composite keys and falls back to all values without a primary key', () => {
    expect(rows.identity(definition(['a', 'b']), { a: 1, b: 'x' })).toBe('[1,"x"]');
    expect(rows.identity(definition([]), { a: 1 })).toBe('[["a",1]]');
    expect(rows.identity(definition(['id']), { name: 'a' })).toBe('[["name","a"]]');
  });

  it('is undefined when nothing was joined', () => {
    expect(rows.identity(definition(['id']), { id: null, name: undefined })).toBeUndefined();
  });
});

describe('IncludeRows.valuesAt', () => {
  const rows = new IncludeRows();

  it('takes only columns directly under the path and parses them', () => {
    const values = rows.valuesAt(
      definition(['id'], ['at']),
      {
        id: 1,
        'Posts.id': 2,
        'Posts.at': 'x',
        'Posts.Tags.id': 3,
        'PostsExtra.id': 4,
      },
      'Posts',
    );
    expect(values).toEqual({ id: 2, at: 'parsed:x' });
  });

  it('gives the same result for the same columns on every row', () => {
    const keys = definition(['id']);
    const first = rows.valuesAt(keys, { 'A.id': 1 }, 'A');
    expect(rows.valuesAt(keys, { 'A.id': 2 }, 'A')).toEqual({ id: 2 });
    expect(first).toEqual({ id: 1 });
  });
});
