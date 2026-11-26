import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

describe('compat: dates in a JSON where', () => {
  it('compares them as timestamps', () =>
    expectSameResult('', async (lib, sequelize) => {
      const { Op } = lib;
      const Event = sequelize.define('Event', { data: lib.DataTypes.JSONB });
      await sequelize.sync({ force: true });
      const at = new Date(Date.UTC(2020, 4, 17, 10, 30));
      const before = new Date(Date.UTC(2020, 0, 1));
      const after = new Date(Date.UTC(2021, 0, 1));
      await Event.bulkCreate([{ data: { at } }, { data: { at: after } }]);
      const ids = async (data: object): Promise<unknown> =>
        (await Event.findAll({ where: { data } as never, order: [['id', 'ASC']] })).map((row) =>
          row.get('id'),
        );
      return [
        await ids({ at }),
        await ids({ at: { [Op.gt]: before } }),
        await ids({ at: { [Op.between]: [before, at] } }),
        await ids({ at: { [Op.in]: [at, after] } }),
        await ids({ at: { [Op.ne]: at } }),
      ];
    }));
});
