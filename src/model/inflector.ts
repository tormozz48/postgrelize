import inflection from 'inflection';

/** The inflection functions postgrelize uses; a library given to `useInflection` must provide them. */
export interface Inflection {
  /** Singular form of a word. */
  singularize: (word: string) => string;
  /** Plural form of a word. */
  pluralize: (word: string) => string;
  /** `snake_case` form of a name. */
  underscore: (word: string) => string;
}

let current: Inflection = inflection;

/** Inflector used for association names and `underscored` columns. */
export const inflector: Inflection = {
  singularize: (word) => current.singularize(word),
  pluralize: (word) => current.pluralize(word),
  underscore: (word) => current.underscore(word),
};

/**
 * Replaces the inflection library used to singularize and pluralize association names and to
 * underscore column names (Sequelize v6 `useInflection`). Call it before defining models.
 *
 * @param custom - Library with `singularize`, `pluralize` and `underscore`.
 * @see {@link Sequelize.useInflection}
 *
 * @example
 * ```ts
 * useInflection({
 *   singularize: (word) => word.replace(/s$/, ''),
 *   pluralize: (word) => `${word}s`,
 *   underscore: (word) => word.replace(/([A-Z])/g, '_$1').toLowerCase(),
 * });
 * ```
 */
export const useInflection = (custom: Inflection): void => {
  current = custom;
};
