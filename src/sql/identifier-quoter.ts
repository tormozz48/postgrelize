const LIMIT = 4096;

/**
 * Quotes SQL identifiers (`"name"`, embedded quotes doubled). The quoted form of a name never
 * changes and the same few table and column names are quoted for every statement, so results are
 * remembered; the memo stops growing at a fixed size, so arbitrary user aliases cannot exhaust memory.
 */
export class IdentifierQuoter {
  readonly #quoted = new Map<string, string>();

  /**
   * Quotes an identifier.
   *
   * @param name - Identifier.
   * @returns `"name"` with embedded quotes doubled.
   */
  quote(name: string): string {
    const known = this.#quoted.get(name);
    if (known !== undefined) {
      return known;
    }
    const quoted = `"${name.replaceAll('"', '""')}"`;
    if (this.#quoted.size < LIMIT) {
      this.#quoted.set(name, quoted);
    }
    return quoted;
  }
}
