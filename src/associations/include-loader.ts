import type { AnyModel, ModelStatic } from '../model/options.ts';
import type { IncludeNode } from './include.ts';
import { IncludeAssembler } from './include-assembler.ts';
import type { IncludeResolver } from './include-resolver.ts';
import { IncludeRows, type IncludeRow, type InstanceBuilder } from './include-rows.ts';
import { SeparateIncludeLoader } from './separate-include-loader.ts';

export type { IncludeRow, InstanceBuilder } from './include-rows.ts';

type Model = ModelStatic<AnyModel>;
type Instance = AnyModel;

/**
 * Turns joined result rows into instance trees (Sequelize v6 de-duplication by primary key),
 * parses raw joined rows, and loads `separate: true` includes with one extra query each.
 */
export class IncludeLoader {
  readonly #assembler = new IncludeAssembler();
  readonly #rows = new IncludeRows();
  readonly #separate: SeparateIncludeLoader;

  /**
   * @param resolver - Converts include nodes back to options for the separate queries.
   */
  constructor(resolver: IncludeResolver) {
    this.#separate = new SeparateIncludeLoader(resolver);
  }

  /**
   * Groups joined rows into instance trees.
   *
   * @param model - Main model.
   * @param includes - Include tree.
   * @param rows - Joined rows.
   * @param parseMain - Parses a row with the main model's data types.
   * @param build - Builds an instance from loaded values.
   * @returns Main instances with the included instances attached.
   */
  assemble(
    model: Model,
    includes: readonly IncludeNode[],
    rows: readonly IncludeRow[],
    parseMain: (row: IncludeRow) => Readonly<Record<string, unknown>>,
    build: InstanceBuilder,
  ): readonly Instance[] {
    return this.#assembler.assemble(model, includes, rows, parseMain, build);
  }

  /**
   * Parses a joined raw row: included keys are parsed with the included model's data types.
   *
   * @param includes - Include tree.
   * @param row - Joined row.
   * @param parseMain - Parses a row with the main model's data types.
   * @returns Parsed row.
   */
  parseRawRow(
    includes: readonly IncludeNode[],
    row: IncludeRow,
    parseMain: (row: IncludeRow) => Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    return this.#rows.parseRaw(includes, row, parseMain);
  }

  /**
   * Loads `separate: true` includes with one extra query each and attaches them, keeping at most
   * `limit` rows per parent.
   *
   * @param parents - Instances the includes belong to.
   * @param includes - Include tree.
   * @param options - Find options (`transaction` is passed on).
   * @returns Resolves when all separate includes are attached.
   */
  loadSeparate(
    parents: readonly Instance[],
    includes: readonly IncludeNode[],
    options: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    return this.#separate.load(parents, includes, options);
  }
}
