import { describe, expect, it } from 'vitest';
import { Op, literal, type WhereOptions } from '../../../src/index.ts';

const scope = <T>(where: WhereOptions<T>): WhereOptions<T> => where;

describe('WhereOptions type inference', () => {
  it('does not infer the attribute type from the conditions under Op.and / Op.or', () => {
    const teams = [{ teamId: 1 }, { teamId: 2 }];
    const parts = [literal('a'), literal('b')];
    const or: WhereOptions<{ teamId: number }> = scope({ [Op.or]: teams });
    const and = scope<{ teamId: number }>({ [Op.and]: [{ teamId: 1 }, ...teams] });
    const lits = scope({ [Op.and]: parts });
    const not = scope({ [Op.not]: literal('c') });
    expect([or, and, lits, not]).toHaveLength(4);
  });
});
