import { describe, it } from 'vitest';
import { expectSameError, expectSameResult, type Lib } from '../support/compat.ts';
import type { Sequelize } from '../../src/index.ts';

const TS = `"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()`;
const SCHEMA = `
  CREATE TABLE "Countries" (id SERIAL PRIMARY KEY, name TEXT, "ContinentId" INTEGER, ${TS});
  CREATE TABLE "Continents" (id SERIAL PRIMARY KEY, name TEXT, ${TS});
  CREATE TABLE "Industries" (id SERIAL PRIMARY KEY, name TEXT, ${TS});
  CREATE TABLE "CountryIndustries" ("CountryId" INTEGER, "IndustryId" INTEGER, "numYears" INTEGER, ${TS});
  CREATE TABLE "People" (id SERIAL PRIMARY KEY, name TEXT, "CountryId" INTEGER, "HomeId" INTEGER, ${TS});
  INSERT INTO "Continents" (name) VALUES ('Europe');
  INSERT INTO "Countries" (name, "ContinentId") VALUES ('England', 1), ('France', 1);
  INSERT INTO "Industries" (name) VALUES ('Coal'), ('Wine'), ('Tea');
  INSERT INTO "CountryIndustries" VALUES (1, 1, 30, now(), now()), (1, 3, 5, now(), now()), (2, 2, 50, now(), now());
  INSERT INTO "People" (name, "CountryId", "HomeId") VALUES ('Bob', 1, 2), ('Bob', 1, 2), ('Bob', 2, 1);`;

const defineModels = (lib: Lib, sequelize: Sequelize) => {
  const { DataTypes } = lib;
  const Continent = sequelize.define('Continent', { name: DataTypes.TEXT });
  const Country = sequelize.define('Country', { name: DataTypes.TEXT, two: DataTypes.VIRTUAL });
  const Industry = sequelize.define('Industry', { name: DataTypes.TEXT });
  const Person = sequelize.define('Person', { name: DataTypes.TEXT, cs: DataTypes.VIRTUAL });
  const CountryIndustry = sequelize.define(
    'CountryIndustry',
    { numYears: DataTypes.INTEGER },
    { tableName: 'CountryIndustries', timestamps: true },
  );
  CountryIndustry.removeAttribute('id');
  Continent.hasMany(Country);
  Country.belongsTo(Continent);
  Country.belongsToMany(Industry, { through: CountryIndustry });
  Industry.belongsToMany(Country, { through: CountryIndustry });
  Country.hasMany(Person);
  Person.belongsTo(Country);
  Person.belongsTo(Country, { as: 'home', foreignKey: 'HomeId' });
  Country.hasMany(Person, { as: 'residents', foreignKey: 'HomeId' });
  return { Continent, Country, Industry, Person, CountryIndustry };
};

const run = (scenario: (models: ReturnType<typeof defineModels>, lib: Lib) => Promise<unknown>) =>
  expectSameResult(SCHEMA, async (lib, sequelize) => scenario(defineModels(lib, sequelize), lib));

const byId = [['id', 'ASC']] as const;

describe('compat: include all options', () => {
  it('filters by association type', () =>
    run(({ Country }) =>
      Country.findAll({ include: [{ all: 'BelongsTo' }] as never, order: byId } as never),
    ));

  it('applies attributes to every generated include', () =>
    run(({ Country }) =>
      Country.findAll({
        include: [{ all: 'HasMany', attributes: ['id'] }] as never,
        order: byId,
      } as never),
    ));

  it('is over-ruled by a specified include', () =>
    run(({ Country, Industry }) =>
      Country.findAll({
        include: [{ all: true }, { model: Industry, attributes: ['name'] }] as never,
        order: byId,
      } as never),
    ));

  it('includes nested associations', () =>
    run(({ Continent }) =>
      Continent.findAll({ include: [{ all: true, nested: true }] as never } as never),
    ));

  it('rejects an invalid type', () =>
    expectSameError(SCHEMA, async (lib, sequelize) =>
      defineModels(lib, sequelize).Country.findAll({
        include: [{ all: 'Nope' }] as never,
      } as never),
    ));
});

describe('compat: include attributes, aliases and through order', () => {
  it('accepts a bare literal in the attributes of an include', () =>
    run(({ Country, Person }, lib) =>
      Country.findAll({
        include: [{ model: Person, attributes: ['id', lib.literal('1 AS "People.cs"')] }] as never,
        order: byId,
      } as never),
    ));

  it('accepts a bare literal in the attributes of the model', () =>
    run(({ Country }, lib) =>
      Country.findAll({
        attributes: ['id', lib.literal('2 AS "two"') as never],
        order: byId,
      } as never),
    ));

  it('accepts the object form of an include alias', () =>
    run(({ Country, Continent }) =>
      Country.findAll({
        include: [{ model: Continent, as: { singular: 'Continent' } }] as never,
        order: byId,
      } as never),
    ));

  it('accepts the singular form of the alias of a to-one include', () =>
    run(({ Person, Country }) =>
      Person.findAll({
        include: [{ model: Country, as: { singular: 'home' } }] as never,
        order: byId,
      } as never),
    ));

  it('accepts the plural form of the alias of a to-many include', () =>
    run(({ Country, Person }) =>
      Country.findAll({
        include: [{ model: Person, as: { plural: 'residents' } }] as never,
        order: byId,
      } as never),
    ));

  it('orders by an attribute of the through model', () =>
    run(({ Country, Industry, CountryIndustry }) =>
      Country.findAll({
        include: [Industry],
        order: [
          ['id', 'ASC'],
          [Industry, CountryIndustry, 'numYears', 'DESC'],
        ],
      } as never),
    ));
});

describe('compat: invalid include elements', () => {
  const cases: readonly [string, unknown][] = [
    ['a number', 1],
    ['null', null],
    ['model: null', { model: null }],
    ['association: null', { association: null }],
    ['an empty object', {}],
  ];
  it.each(cases)('rejects %s', async (_name, element) => {
    await expectSameError(SCHEMA, async (lib, sequelize) =>
      defineModels(lib, sequelize).Country.findAll({ include: [element] } as never),
    );
  });
});

describe('compat: include with empty attributes and added keys', () => {
  it('selects the primary key so rows with equal attributes stay apart', () =>
    run(({ Person, Country }) =>
      Person.findAll({
        attributes: ['name'],
        include: [{ model: Country, attributes: ['name'] }] as never,
        order: byId,
      } as never),
    ));

  it('matches a separate include when the key is not in the attributes', () =>
    run(({ Continent, Country }) =>
      Continent.findAll({
        attributes: ['name'],
        include: [{ model: Country, separate: true }] as never,
      } as never),
    ));

  it('leaves out a hasMany include with attributes: []', () =>
    run(({ Continent, Country }) =>
      Continent.findAll({ include: [{ model: Country, attributes: [] }] as never } as never),
    ));

  it('leaves out a belongsToMany include with attributes: []', () =>
    run(({ Country, Industry }) =>
      Country.findAll({
        include: [
          { model: Industry, attributes: [], through: { attributes: ['numYears'] } },
        ] as never,
        order: byId,
      } as never),
    ));

  it('does not leak the key added for the sub-query joins', () =>
    run(({ Country, Continent, Person }) =>
      Country.findAll({
        attributes: ['name'],
        include: [Continent, Person] as never,
        order: [['name', 'ASC']],
        limit: 10,
      } as never),
    ));
});
