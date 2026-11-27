const LIMITS: Readonly<Record<string, number>> = {
  SMALLINT: 2 ** 15,
  INTEGER: 2 ** 31,
  BIGINT: 2 ** 63,
};

/**
 * Tells whether a column of an integer type can hold a key given as a number.
 *
 * @internal
 */
export class IntegerKeys {
  /**
   * @param type - Column type of the primary key.
   * @param key - Searched key.
   * @returns False for a number that is no integer or is outside the range of the type.
   */
  holds(type: string | undefined, key: unknown): boolean {
    const limit = LIMITS[type ?? ''];
    if (limit === undefined || typeof key !== 'number') {
      return true;
    }
    return Number.isInteger(key) && key >= -limit && key < limit;
  }
}
