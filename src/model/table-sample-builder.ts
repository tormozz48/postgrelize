import type { TableSample } from '../sql/ast.ts';
import { SqlAst } from '../sql/ast.ts';
import type { TableSampleOptions } from './source-options.ts';

const ast = new SqlAst();
const METHODS: ReadonlySet<string> = new Set(['BERNOULLI', 'SYSTEM']);

/** Validates `sample` options and converts them to a `TABLESAMPLE` clause. */
export class TableSampleBuilder {
  /**
   * Builds the sampling clause.
   *
   * @param sample - Sample options.
   * @returns `TABLESAMPLE` node with bound percent and seed.
   * @throws Error for an unknown method, a percent outside 0–100, or a non-finite seed.
   */
  build(sample: TableSampleOptions): TableSample {
    const method = String(sample.method).toUpperCase();
    if (!METHODS.has(method)) {
      throw new Error(`Invalid TABLESAMPLE method: ${String(sample.method)}`);
    }
    if (!Number.isFinite(sample.percent) || sample.percent < 0 || sample.percent > 100) {
      throw new Error('TABLESAMPLE percent must be a number from 0 to 100');
    }
    if (sample.seed !== undefined && !Number.isFinite(sample.seed)) {
      throw new Error('TABLESAMPLE seed must be a finite number');
    }
    return {
      method: method as TableSample['method'],
      percent: ast.param(sample.percent),
      ...(sample.seed === undefined ? {} : { seed: ast.param(sample.seed) }),
    };
  }
}
