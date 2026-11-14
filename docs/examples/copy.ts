import { DataTypes, Op, type Sequelize } from 'postgrelize';

// #region source
async function* readEvents(): AsyncGenerator<{ kind: string; payload: object }> {
  for (let index = 0; index < 1000; index += 1) {
    yield { kind: index % 2 === 0 ? 'view' : 'click', payload: { index } };
  }
}
// #endregion source

export const run = async (sequelize: Sequelize): Promise<void> => {
  const Event = sequelize.define('Event', {
    kind: { type: DataTypes.TEXT, allowNull: false },
    payload: DataTypes.JSONB,
    tags: DataTypes.ARRAY(DataTypes.TEXT),
  });
  await sequelize.sync();

  // #region copy-from
  const fromArray = await Event.copyFrom([
    { kind: 'signup', payload: { plan: 'pro' }, tags: ['web'] },
    { kind: 'login', payload: null, tags: null },
  ]);

  const fromStream = await Event.copyFrom(readEvents(), { columns: ['kind', 'payload'] });
  // fromArray === 2, fromStream === 1000; createdAt / updatedAt are filled in
  // #endregion copy-from

  // #region copy-to
  const chunks: Buffer[] = [];
  for await (const chunk of Event.copyTo({
    attributes: ['id', 'kind', 'tags'],
    where: { kind: { [Op.in]: ['signup', 'login'] } },
    order: [['id', 'ASC']],
    format: 'csv',
    header: true,
  })) {
    chunks.push(chunk);
  }
  const csv = Buffer.concat(chunks).toString('utf8');
  // id,kind,tags
  // 1,signup,{web}
  // 2,login,
  // #endregion copy-to

  if (
    fromArray !== 2 ||
    fromStream !== 1000 ||
    (await Event.count({ where: { kind: 'view' } })) !== 500 ||
    csv !== 'id,kind,tags\n1,signup,{web}\n2,login,\n'
  ) {
    throw new Error(`copy example: unexpected result ${JSON.stringify(csv)}`);
  }
};
