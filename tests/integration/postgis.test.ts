import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { DataTypes, Op, Sequelize, col, fn, where } from '../../src/index.ts';
import { testDatabaseUrl } from '../support/db-url.ts';
import { withSchema } from '../support/with-schema.ts';
import { registerFileDatabase } from '../support/file-database-hooks.ts';

// Extensions are database-wide: a parallel file that creates the same one would break this file.
registerFileDatabase();

// Backs the PostGIS row of stage S15 in docs/coverage/postgresql-features.ts. The tests skip
// when the server has no `postgis` extension (the plain PostgreSQL images used by CI).

const probe = async (): Promise<boolean> => {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_available_extensions WHERE name = 'postgis'",
    );
    return (rowCount ?? 0) > 0;
  } finally {
    await client.end();
  }
};

const hasPostgis = await probe();

const opened: Sequelize[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((sequelize) => sequelize.close()));
});

const inSchema = <T>(run: (sequelize: Sequelize) => Promise<T>): Promise<T> =>
  withSchema(async ({ schema, client }) => {
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
    const sequelize = new Sequelize(testDatabaseUrl(), {
      logging: false,
      dialectOptions: { options: `-c search_path=${schema},public` },
    });
    opened.push(sequelize);
    return run(sequelize);
  });

const crs = { type: 'name', properties: { name: 'EPSG:4326' } };

describe.skipIf(!hasPostgis)('PostGIS geometry and geography', () => {
  it('round-trips GeoJSON through geometry and geography columns', () =>
    inSchema(async (sequelize) => {
      const Place = sequelize.define(
        'Place',
        {
          name: DataTypes.STRING,
          loc: DataTypes.GEOMETRY('POINT', 4326),
          area: DataTypes.GEOMETRY('POLYGON', 4326),
          route: DataTypes.GEOMETRY,
          far: DataTypes.GEOGRAPHY('POINT', 4326),
        },
        { timestamps: false },
      );
      await sequelize.sync();
      const loc = { type: 'Point', coordinates: [30.5, 50.4] };
      const area = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 0],
          ],
        ],
      };
      const route = {
        type: 'LineString',
        coordinates: [
          [0, 0, 5],
          [1, 1, 6],
        ],
      };
      await Place.create({ name: 'a', loc, area, route, far: loc });
      const row = await Place.findOne();
      expect(row?.get('loc')).toEqual({ ...loc, crs });
      expect(row?.get('area')).toEqual({ ...area, crs });
      expect(row?.get('route')).toEqual({ ...route, crs });
      expect(row?.get('far')).toEqual({ ...loc, crs });
    }));

  it('keeps an explicit SRID and filters with PostGIS functions', () =>
    inSchema(async (sequelize) => {
      const Place = sequelize.define(
        'Place',
        { name: DataTypes.STRING, loc: DataTypes.GEOMETRY('POINT', 3857) },
        { timestamps: false },
      );
      await sequelize.sync();
      const metric = { name: 'EPSG:3857' };
      const at = (x: number): Record<string, unknown> => ({
        type: 'Point',
        coordinates: [x, 0],
        crs: { type: 'name', properties: metric },
      });
      await Place.bulkCreate([
        { name: 'near', loc: at(1) },
        { name: 'far', loc: at(1000) },
      ]);
      const near = await Place.findAll({
        where: where(
          fn('ST_DWithin', col('loc'), fn('ST_GeomFromText', 'POINT(0 0)', 3857), 10),
          true,
        ),
      });
      expect(near.map((place) => place.get('name'))).toEqual(['near']);
      expect(await Place.count({ where: { loc: { [Op.overlap]: at(1) } } })).toBe(1);
      expect((await Place.findOne({ where: { name: 'far' } }))?.get('loc')).toEqual({
        ...at(1000),
        crs: { type: 'name', properties: metric },
      });
    }));
});

describe('PostGIS availability', () => {
  it('reports whether the server offers the extension', () => {
    expect(typeof hasPostgis).toBe('boolean');
  });
});
