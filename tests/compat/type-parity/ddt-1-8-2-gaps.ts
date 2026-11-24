import { Op, type Model, type ModelStatic, type WhereOptions } from '@orm';

// B: two-argument changed with keyof M
export function changedGeneric<M extends Model>(instance: M, fieldName: string): void {
  instance.changed(fieldName as keyof M, false);
  instance.changed(fieldName as keyof M);
}

// D: a generic where helper feeds a typed where
interface TaskAttributes {
  id: number;
  assigneeAgentId: number | null;
  type: 'a' | 'b';
}
declare function scope<T>(where: WhereOptions<T>): WhereOptions<T>;
declare function findAll(options: { where?: WhereOptions<TaskAttributes> }): void;
declare const types: ('a' | 'b')[];
declare const agentId: number | undefined;
declare const agentIds: number[];

export const d1 = (): void => {
  findAll({ where: scope({ type: { [Op.in]: types } }) });
  findAll({
    where: scope({
      type: { [Op.in]: types },
      ...(agentId === undefined ? {} : { assigneeAgentId: agentId }),
    }),
  });
  findAll({ where: scope({ assigneeAgentId: { [Op.in]: agentIds } }) });
  findAll({ where: scope({ type: { [Op.notIn]: types } }) });
  findAll({ where: scope({ assigneeAgentId: agentId }) });
  findAll({ where: scope({ assigneeAgentId: { [Op.ne]: null } }) });
};

declare const Task: ModelStatic<Model<TaskAttributes>>;
export const d2 = (): Promise<unknown> =>
  Task.findAll({
    where: scope({
      type: { [Op.notIn]: types },
      ...(agentId === undefined ? {} : { assigneeAgentId: agentId }),
    }),
  });
