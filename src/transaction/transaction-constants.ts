/** Transaction isolation levels (Sequelize v6 `Transaction.ISOLATION_LEVELS`). */
export const ISOLATION_LEVELS = {
  /** `READ UNCOMMITTED` (behaves as `READ COMMITTED` in PostgreSQL). */
  READ_UNCOMMITTED: 'READ UNCOMMITTED',
  /** `READ COMMITTED` (PostgreSQL default). */
  READ_COMMITTED: 'READ COMMITTED',
  /** `REPEATABLE READ`. */
  REPEATABLE_READ: 'REPEATABLE READ',
  /** `SERIALIZABLE`. */
  SERIALIZABLE: 'SERIALIZABLE',
} as const;

/** One of {@link ISOLATION_LEVELS}. */
export type IsolationLevel = (typeof ISOLATION_LEVELS)[keyof typeof ISOLATION_LEVELS];

/** Row lock strengths for `findAll({ lock })` (Sequelize v6 `Transaction.LOCK`). */
export const LOCK = {
  /** `FOR UPDATE`. */
  UPDATE: 'UPDATE',
  /** `FOR SHARE`. */
  SHARE: 'SHARE',
  /** `FOR KEY SHARE`. */
  KEY_SHARE: 'KEY SHARE',
  /** `FOR NO KEY UPDATE`. */
  NO_KEY_UPDATE: 'NO KEY UPDATE',
} as const;

/** One of {@link LOCK}. */
export type LockStrength = (typeof LOCK)[keyof typeof LOCK];

/** Transaction types; accepted for Sequelize v6 compatibility and ignored by PostgreSQL. */
export const TRANSACTION_TYPES = {
  /** SQLite-only, ignored. */
  DEFERRED: 'DEFERRED',
  /** SQLite-only, ignored. */
  IMMEDIATE: 'IMMEDIATE',
  /** SQLite-only, ignored. */
  EXCLUSIVE: 'EXCLUSIVE',
} as const;
