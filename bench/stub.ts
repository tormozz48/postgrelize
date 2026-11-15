// In-memory `pg` responder for stub mode: no I/O, so the benchmark measures only library overhead.
// postgrelize takes its clients from `Pool#connect`, Sequelize v6 builds `pg.Client` itself, so both
// entry points are replaced; the responder is shared and derives result rows from the SQL text.
import { Client, Pool } from 'pg';

type Row = Record<string, unknown>;
export type StubResult = Readonly<{ rows: Row[]; rowCount: number; fields: unknown[] }>;

const FIELD_ALIAS = /AS "([^"]+)"/g;
const LAST_SEGMENT = /([^.]+)$/;

const scalarFor = (alias: string, index: number): unknown => {
  const name = LAST_SEGMENT.exec(alias)?.[1] ?? alias;
  if (name === 'createdAt' || name === 'updatedAt') {
    return new Date(0);
  }
  if (name === 'meta') {
    return { index };
  }
  if (name === 'id') {
    return alias === 'id' ? Math.floor(index / 5) + 1 : index + 1;
  }
  if (name.endsWith('Id')) {
    return (index % 20) + 1;
  }
  return name === 'qty' ? index : `${name}${index}`;
};

const FLAT = ['id', 'sku', 'qty', 'meta', 'createdAt', 'updatedAt'];

type Shape = Readonly<{ template: Row; ids: readonly string[] }>;
const shapes = new Map<string, Shape>();
// The row layout depends only on the statement text, so it is derived once per text; every call
// then costs one object copy per row, close to what a real driver result costs.
const shapeOf = (text: string): Shape => {
  const cached = shapes.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const found = [...text.matchAll(FIELD_ALIAS)].map((match) => match[1] ?? '');
  const aliases = found.length > 0 ? found : FLAT;
  const template = Object.fromEntries(aliases.map((alias) => [alias, scalarFor(alias, 0)]));
  const ids = aliases.filter((alias) => (LAST_SEGMENT.exec(alias)?.[1] ?? alias) === 'id');
  const shape = { template, ids };
  shapes.set(text, shape);
  return shape;
};

const rowsFor = (text: string, count: number): Row[] => {
  const { template, ids } = shapeOf(text);
  return Array.from({ length: count }, (_, index) => {
    const row = { ...template };
    for (const id of ids) {
      row[id] = id === 'id' ? Math.floor(index / 5) + 1 : index + 1;
    }
    return row;
  });
};

const wrap = (rows: Row[], rowCount = rows.length): StubResult => ({ rows, rowCount, fields: [] });

export const respond = (text: string, values: readonly unknown[]): StubResult => {
  if (text.startsWith('SELECT count')) {
    return wrap([{ count: '990' }], 1);
  }
  if (/^(SHOW SERVER_VERSION|SELECT VERSION)/i.test(text)) {
    return wrap([{ server_version: '17.0', version: 'PostgreSQL 17.0' }]);
  }
  if (text.startsWith('SELECT')) {
    const [, bound, literal] = /LIMIT (?:\$(\d+)|(\d+))/.exec(text) ?? [];
    const limit = literal === undefined ? Number(values[Number(bound) - 1] ?? 1) : Number(literal);
    return wrap(rowsFor(text, limit));
  }
  if (text.startsWith('INSERT')) {
    const count = text.split('), (').length;
    return wrap(rowsFor(text, count).map((row) => Object.assign(row, { __pgz_inserted: true })));
  }
  return wrap([], 1);
};

type QueryArg = string | { text: string; values?: unknown[] };
type Callback = (error: Error | null, result: StubResult) => void;
// pg takes a promise-style call (postgrelize); Sequelize v6 passes a Node-style callback.
const handle = (
  query: QueryArg,
  second?: readonly unknown[] | Callback,
  third?: Callback,
): Promise<StubResult> | undefined => {
  const callback = typeof second === 'function' ? second : third;
  const values = Array.isArray(second) ? second : [];
  const result =
    typeof query === 'string' ? respond(query, values) : respond(query.text, query.values ?? []);
  if (callback === undefined) {
    return Promise.resolve(result);
  }
  queueMicrotask(() => callback(null, result));
  return undefined;
};

const connect = (callback?: (error?: Error) => void): Promise<void> | undefined => {
  if (callback === undefined) {
    return Promise.resolve();
  }
  callback();
  return undefined;
};
const end = (callback?: () => void): Promise<void> | undefined => {
  if (callback === undefined) {
    return Promise.resolve();
  }
  callback();
  return undefined;
};

export const installStub = (): void => {
  const client = { query: handle, release: () => undefined };
  (Pool.prototype as unknown as { connect: () => Promise<unknown> }).connect = () =>
    Promise.resolve(client);
  const proto = Client.prototype as unknown as Record<string, unknown>;
  proto['connect'] = connect;
  proto['query'] = handle;
  proto['end'] = end;
};
