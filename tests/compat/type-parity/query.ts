import { Model, QueryTypes, Utils, type Options, type Sequelize, type Transaction } from '@orm';

declare const sequelize: Sequelize;
declare const transaction: Transaction;

class Entry extends Model {}

export async function queries(): Promise<void> {
  // oneTimeMoveLegacyLandAccount.job.ts
  const rows = await sequelize.query<{ journalEntryCount: number; id: string }>('select 1', {
    type: QueryTypes.SELECT,
    transaction,
    replacements: { id: 1 },
  });
  const count: number | undefined = rows[0]?.journalEntryCount;
  void count;

  const one = await sequelize.query<{ id: string }>('select 1', {
    type: QueryTypes.SELECT,
    plain: true,
  });
  const id: string | undefined = one?.id;
  void id;

  await sequelize.query({ query: 'select $1', values: [1] }, { type: QueryTypes.SELECT });
  const [results, metadata] = await sequelize.query('select 1');
  void results;
  void metadata;
  const [, affected] = await sequelize.query('update t set a = 1', {
    type: QueryTypes.UPDATE,
  });
  const changed: number = affected;
  void changed;
  const models: Entry[] = await sequelize.query('select 1', { model: Entry, mapToModel: true });
  void models;
  await sequelize.query('select 1', { type: QueryTypes.RAW, raw: true, bind: [1] });

  const connection = await sequelize.connectionManager.getConnection({ type: 'read' });
  sequelize.connectionManager.releaseConnection(connection);
  void Utils;
  const options: Options = { dialect: 'postgres', logging: false };
  void options;
}
