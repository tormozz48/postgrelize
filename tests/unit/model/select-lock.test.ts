import { describe, expect, it } from 'vitest';
import { SelectLock } from '../../../src/model/select-lock.ts';
import { SqlCompiler } from '../../../src/sql/compile.ts';

const locks = new SelectLock();
const compiler = new SqlCompiler();
const sql = (options: Parameters<SelectLock['of']>[0]): string => {
  const lock = locks.of(options);
  return compiler.compile({
    kind: 'select',
    columns: [{ kind: 'star' }],
    from: { name: 'docs' },
    ...(lock === undefined ? {} : { lock }),
  }).text;
};

describe('SelectLock', () => {
  it.each(['UPDATE', 'NO KEY UPDATE', 'SHARE', 'KEY SHARE'] as const)(
    'names tables in FOR %s OF',
    (level) => {
      expect(sql({ lock: { level, of: 'doc' } })).toMatch(new RegExp(`FOR ${level} OF "doc"$`));
      expect(sql({ lock: { level, of: ['doc', { name: 'Line' }] }, noWait: true })).toMatch(
        new RegExp(`FOR ${level} OF "doc", "Line" NOWAIT$`),
      );
      expect(sql({ lock: { level, of: 'posts->comments' }, skipLocked: true })).toMatch(
        new RegExp(`FOR ${level} OF "posts->comments" SKIP LOCKED$`),
      );
    },
  );

  it('quotes a hostile alias as one identifier', () => {
    expect(sql({ lock: { level: 'UPDATE', of: 'a"; DROP TABLE x; --' } })).toMatch(
      /FOR UPDATE OF "a""; DROP TABLE x; --"$/,
    );
  });

  it('leaves the SQL unchanged for skipOrderGuard', () => {
    expect(sql({ lock: { level: 'UPDATE', skipOrderGuard: true } })).toMatch(/FOR UPDATE$/);
  });

  it.each([[[]], [''], [[{}]]])('refuses lock.of %j', (of) => {
    expect(() => locks.of({ lock: { level: 'UPDATE', of: of as never } })).toThrow('lock.of');
  });
});
