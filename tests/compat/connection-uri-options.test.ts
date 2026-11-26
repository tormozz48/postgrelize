import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../support/db-url.ts';
import { libraries } from '../support/compat.ts';

describe('compat: query string of a connection URI', () => {
  it('passes options and application_name to the connection', async () => {
    const uri = new URL(testDatabaseUrl());
    uri.search = '?options=-c%20search_path%3dpg_catalog&application_name=pgz%20uri';
    const read = async (name: 'sequelize' | 'postgrelize'): Promise<unknown> => {
      const sequelize = new libraries[name].Sequelize(uri.toString(), { logging: false });
      try {
        return await sequelize.query(
          "SELECT current_setting('search_path') AS path, current_setting('application_name') AS app",
          { type: 'SELECT' as never },
        );
      } finally {
        await sequelize.close();
      }
    };
    const actual = await read('postgrelize');
    expect(actual).toEqual(await read('sequelize'));
    expect(actual).toEqual([{ path: 'pg_catalog', app: 'pgz uri' }]);
  });
});
