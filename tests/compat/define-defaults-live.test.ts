import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: sequelize.options.define changed after construction', () => {
  it('applies to later definitions and merges method maps with the model options', () =>
    expectSameResult('', async (lib, sequelize) => {
      const calls: string[] = [];
      const setter = (name: string) =>
        function (this: unknown) {
          calls.push(name);
        };
      (sequelize as unknown as { options: { define: object } }).options.define = {
        timestamps: false,
        setterMethods: { shared: setter('global shared'), override: setter('global override') },
        getterMethods: { upper: () => 'global getter' },
      };
      const Entity = sequelize.define('Entity', {}, {
        setterMethods: { own: setter('own'), override: setter('model override') },
      } as never);
      const instance = Entity.build() as unknown as Record<string, unknown>;
      instance['shared'] = 1;
      instance['override'] = 1;
      instance['own'] = 1;
      return [calls, instance['upper'], Object.keys(Entity.rawAttributes)];
    }));
});
