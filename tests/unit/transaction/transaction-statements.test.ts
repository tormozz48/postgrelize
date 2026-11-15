import { describe, expect, it } from 'vitest';
import { TransactionStatements } from '../../../src/transaction/transaction-statements.ts';

describe('TransactionStatements.begin', () => {
  const statements = new TransactionStatements('t1', false);

  it('renders isolation, access and deferrable modes', () => {
    expect(statements.begin({})).toBe('START TRANSACTION');
    expect(
      statements.begin({ isolationLevel: 'SERIALIZABLE', readOnly: true, deferrable: true }),
    ).toBe('START TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE');
    expect(statements.begin({ deferrable: false })).toBe('START TRANSACTION NOT DEFERRABLE');
  });

  it('rejects non-boolean deferrable and ignores it for savepoints', () => {
    expect(() => statements.begin({ deferrable: 'yes' as never })).toThrow(/deferrable/);
    expect(new TransactionStatements('t2', true).begin({ deferrable: true })).toBe(
      'SAVEPOINT "t2"',
    );
  });
});
