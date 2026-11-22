import { afterEach, describe, expect, it } from 'vitest';
import { expectSameResult, libraries } from '../support/compat.ts';

describe('compat: define and init hooks', () => {
  it('beforeDefine and afterDefine of the instance change and observe the definition', () =>
    expectSameResult('', async (lib, sequelize) => {
      const seen: string[] = [];
      sequelize.addHook(
        'beforeDefine',
        (
          attributes: Record<string, unknown>,
          options: { modelName: string; name: { plural: string } },
        ) => {
          seen.push(`before:${options.modelName}`);
          options.modelName = 'bar';
          options.name.plural = 'barrs';
          attributes['extra'] = lib.DataTypes.STRING;
        },
      );
      sequelize.addHook('afterDefine', (model: { name: string }) => {
        seen.push(`after:${model.name}`);
      });
      const model = sequelize.define('foo', { name: lib.DataTypes.STRING });
      return {
        seen,
        name: model.name,
        plural: (model.options as { name: { plural: string } }).name.plural,
        attributes: Object.keys(model.getAttributes()),
        registered: Object.keys(sequelize.models),
      };
    }));
});

describe('compat: static init hooks', () => {
  afterEach(() => {
    for (const lib of Object.values(libraries)) {
      (lib.Sequelize as unknown as { options: { hooks: object } }).options.hooks = {};
    }
  });

  it('Sequelize.beforeInit and afterInit change the config and the options of new instances', () => {
    const result = Object.fromEntries(
      Object.entries(libraries).map(([name, lib]) => {
        const Static = lib.Sequelize as unknown as {
          addHook(type: string, fn: (...args: never[]) => void): void;
          hasHook(type: string): boolean | undefined;
        };
        Static.addHook('beforeInit', (config: { database: string }, options: { host: string }) => {
          config.database = 'db2';
          options.host = 'server9';
        });
        Static.addHook('afterInit', (instance: { options: { protocol: string } }) => {
          instance.options.protocol = 'udp';
        });
        const seq = new lib.Sequelize('db', 'user', 'pass', { dialect: 'postgres' }) as unknown as {
          config: { database: string; host: string };
          options: { host: string; protocol: string };
        };
        return [
          name,
          {
            database: seq.config.database,
            host: seq.options.host,
            protocol: seq.options.protocol,
            has: !!Static.hasHook('beforeInit'),
          },
        ];
      }),
    );
    expect(result['postgrelize']).toEqual(result['sequelize']);
    expect(result['postgrelize']).toMatchObject({
      database: 'db2',
      host: 'server9',
      protocol: 'udp',
    });
  });
});
