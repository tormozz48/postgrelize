import { TypeValidator } from '../data-types/type-validator.ts';
import { DefaultValueGenerator } from '../data-types/default-value-generator.ts';
import { Op } from '../expressions/op.ts';
import { SqlAst, type ExprNode, type SetItem, type TableRef } from '../sql/ast.ts';
import { WhereCompiler, type AttributeRef } from '../where/where.ts';
import type { AttributeDefinition, ModelDefinition } from './model-definition.ts';

const ast = new SqlAst();
const types = new TypeValidator();

const attributeRef = (attribute: AttributeDefinition): AttributeRef => ({
  field: attribute.field,
  ...(attribute.type.isJson === true ? { isJson: true } : {}),
  ...(attribute.type.bindCast === undefined ? {} : { castType: attribute.type.bindCast }),
  ...(attribute.type.serialize === undefined ? {} : { serialize: attribute.type.serialize }),
  ...(attribute.typeChecked === true
    ? { check: (value: unknown) => types.check(attribute.type, attribute.fieldName, value) }
    : {}),
});

/**
 * Maps model attributes to SQL pieces shared by the statement builders: table reference, where
 * compiler resolving attribute names, stored columns, bound column values, SET items, RETURNING
 * lists, primary-key and paranoid conditions.
 */
export class AttributeColumns {
  /**
   * Table reference of the model.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @returns Table reference.
   */
  table(definition: ModelDefinition, alias?: string): TableRef {
    return {
      name: definition.tableName,
      ...(definition.schema === undefined ? {} : { schema: definition.schema }),
      ...(alias === undefined ? {} : { alias }),
    };
  }

  /**
   * Where compiler resolving attribute names of the model.
   *
   * @param definition - Model definition.
   * @param alias - Table alias used to qualify columns.
   * @param inAsAnyThreshold - Lists at least this long compile to `= ANY($n)`.
   * @returns Where compiler.
   */
  whereCompiler(
    definition: ModelDefinition,
    alias: string | undefined,
    inAsAnyThreshold?: number,
  ): WhereCompiler {
    return new WhereCompiler({
      ...(alias === undefined ? {} : { tableAlias: alias }),
      ...(inAsAnyThreshold === undefined ? {} : { inAsAnyThreshold }),
      primaryKey: definition.primaryKeys[0] ?? 'id',
      resolve: (name) => {
        const attribute = definition.attributes.get(name);
        return attribute === undefined ? undefined : attributeRef(attribute);
      },
    });
  }

  /**
   * Compiles a `where` / `having` option; empty conditions give `undefined`.
   *
   * @param where - Condition.
   * @param ctx - Where compiler of the model.
   * @returns Expression or `undefined`.
   */
  where(where: unknown, ctx: WhereCompiler): ExprNode | undefined {
    return WhereCompiler.isEmpty(where) ? undefined : ctx.compile(where);
  }

  /**
   * Attributes stored in the table (not virtual).
   *
   * @param definition - Model definition.
   * @returns Stored attributes in definition order.
   */
  stored(definition: ModelDefinition): readonly AttributeDefinition[] {
    return [...definition.attributes.values()].filter(
      (attribute) => attribute.type.isVirtual !== true,
    );
  }

  /**
   * Column value for INSERT / UPDATE: bound parameter, expression, or generated default.
   *
   * @param attribute - Attribute of the column (`undefined` for unknown names).
   * @param value - Value or expression.
   * @param ctx - Where compiler of the model.
   * @returns Value expression.
   */
  value(attribute: AttributeDefinition | undefined, value: unknown, ctx: WhereCompiler): ExprNode {
    return value instanceof DefaultValueGenerator
      ? ast.param(value.generate())
      : ctx.toExpr(value, attribute === undefined ? undefined : attributeRef(attribute));
  }

  /**
   * SET items from attribute-keyed values (`undefined` values and generated columns are skipped).
   *
   * @param definition - Model definition.
   * @param values - Values by attribute name.
   * @param ctx - Where compiler used for expressions.
   * @returns SET items.
   */
  setItems(
    definition: ModelDefinition,
    values: Readonly<Record<string, unknown>>,
    ctx: WhereCompiler = this.whereCompiler(definition, undefined),
  ): readonly SetItem[] {
    return Object.entries(values)
      .filter(
        ([name, value]) =>
          value !== undefined && definition.attributes.get(name)?.generated === undefined,
      )
      .map(([name, value]) => {
        const attribute = definition.attributes.get(name);
        return { column: attribute?.field ?? name, value: this.value(attribute, value, ctx) };
      });
  }

  /**
   * RETURNING list: all stored columns aliased to attribute names.
   *
   * @param definition - Model definition.
   * @param alias - Table alias.
   * @returns Column list.
   */
  returningAll(definition: ModelDefinition, alias?: string): readonly ExprNode[] {
    return this.stored(definition).map((attribute) => {
      const column =
        alias === undefined ? ast.ident(attribute.field) : ast.ident(alias, attribute.field);
      return attribute.field === attribute.fieldName && alias === undefined
        ? column
        : { kind: 'alias', expr: column, alias: attribute.fieldName };
    });
  }

  /**
   * Primary-key where object for an instance.
   *
   * @param definition - Model definition.
   * @param values - Instance values.
   * @returns `{ [primaryKey]: value }`.
   */
  primaryKeyWhere(
    definition: ModelDefinition,
    values: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>> {
    return Object.fromEntries(definition.primaryKeys.map((name) => [name, values[name]]));
  }

  /**
   * Value of `deletedAt` for a row that is not soft-deleted: its `defaultValue` when that is truthy
   * (v6), else `NULL`.
   *
   * @param definition - Model definition of a paranoid model.
   * @returns The "not deleted" value.
   */
  notDeletedValue(definition: ModelDefinition): unknown {
    const value =
      definition.deletedAt === undefined
        ? undefined
        : definition.attributes.get(definition.deletedAt)?.defaultValue;
    return value === undefined || typeof value === 'function' || !value ? null : value;
  }

  /**
   * Adds the "not soft-deleted" condition (`deletedAt IS NULL`, or `= defaultValue`) to `where` for
   * paranoid models unless `paranoid: false`.
   *
   * @param definition - Model definition.
   * @param where - Condition.
   * @param paranoid - `paranoid` option.
   * @returns Condition.
   */
  paranoid(definition: ModelDefinition, where: unknown, paranoid: boolean | undefined): unknown {
    if (definition.deletedAt === undefined || paranoid === false) {
      return where;
    }
    const notDeleted = { [definition.deletedAt]: this.notDeletedValue(definition) };
    return where === undefined || where === null ? notDeleted : { [Op.and]: [notDeleted, where] };
  }
}
