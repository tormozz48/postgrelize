import { createRequire } from 'node:module';

/** Reads the version of the installed package (`Sequelize.version`). */
export class PackageVersion {
  #cached: string | undefined;

  /**
   * @returns The `version` field of postgrelize's `package.json`.
   */
  read(): string {
    this.#cached ??= (
      createRequire(import.meta.url)('../package.json') as { version: string }
    ).version;
    return this.#cached;
  }
}
