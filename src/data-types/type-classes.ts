/**
 * Type key → the bare `DataTypes` member of that key. A data type reports it as its `constructor`,
 * so `attribute.type.constructor.key` reads like on a v6 type instance.
 *
 * @internal
 */
export const typeClasses = new Map<string, object>();
