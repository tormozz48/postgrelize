import { describe, expect, it, vi } from 'vitest';
import { libraries, runScenario, type Lib } from '../support/compat.ts';

const warnings = async (lib: Lib): Promise<string[]> => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await runScenario(lib, '', async ({ DataTypes }, sequelize) => {
      sequelize.define('Plain', { age: DataTypes.INTEGER, size: DataTypes.BIGINT });
      sequelize.define('A', { age: DataTypes.TINYINT.UNSIGNED, size: DataTypes.INTEGER(11) });
      sequelize.define('B', { age: DataTypes.TINYINT(2) });
    });
    return warn.mock.calls.map(([message]) => String(message));
  } finally {
    warn.mockRestore();
  }
};

describe('compat: warning for unsupported integer options', () => {
  it('warns like v6, once per type', async () => {
    const expected = await warnings(libraries.sequelize);
    expect(expected).toHaveLength(2);
    expect(await warnings(libraries.postgrelize)).toEqual(expected);
  });
});
