/**
 * Default value marker (`DataTypes.NOW`, `DataTypes.UUIDV1`, `DataTypes.UUIDV4`): generates a value on the client when a
 * row is built.
 */
export class DefaultValueGenerator {
  /** Sequelize v6 type key, e.g. `'UUIDV4'`. */
  readonly key: string;
  /** Produces the default value. */
  readonly generate: () => unknown;

  /**
   * @param key - Sequelize v6 type key.
   * @param generate - Produces the default value.
   */
  constructor(key: string, generate: () => unknown) {
    this.key = key;
    this.generate = generate;
    Object.freeze(this);
  }
}
