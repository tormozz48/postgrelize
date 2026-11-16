import { describe, expect, it } from 'vitest';
import { PAYLOADS, settle, withCanary } from '../../support/injection.ts';

const syntaxError = (result: unknown): boolean =>
  (result as { original?: { code?: string } } | undefined)?.original?.code === '42601';

describe('index fields cannot break out of their quoting', () => {
  it('quotes index names, columns and collations, and rejects payload operator classes', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const named = await settle(
          queryInterface.addIndex('canary', {
            name: payload,
            fields: [{ name: 'id', collate: payload }],
          }),
        );
        expect(syntaxError(named)).toBe(false);
        const column = await settle(queryInterface.addIndex('canary', [payload]));
        expect(syntaxError(column)).toBe(false);
        for (const options of [
          { fields: [{ name: 'id', operator: payload }] },
          { using: payload, fields: ['id'] },
        ]) {
          const guarded = await settle(
            queryInterface.addIndex('canary', { name: 'i', ...options }),
          );
          expect(syntaxError(guarded)).toBe(false);
        }
      }
    }));

  it('coerces nulls and order to their keywords', () =>
    withCanary(async ({ sequelize }) => {
      const queryInterface = sequelize.getQueryInterface();
      for (const payload of PAYLOADS) {
        const result = await settle(
          queryInterface.addIndex('canary', {
            name: 'i_nulls',
            fields: [{ name: 'id', nulls: payload as never, order: payload as never }],
          }),
        );
        expect(syntaxError(result)).toBe(false);
        await settle(queryInterface.removeIndex('canary', 'i_nulls'));
      }
    }));
});
