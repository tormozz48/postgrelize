import { inject } from 'vitest';

let fileDatabaseUrl: string | undefined;

export const useTestDatabaseUrl = (url: string | undefined): void => {
  fileDatabaseUrl = url;
};

export const testDatabaseUrl = (): string => fileDatabaseUrl ?? inject('databaseUrl');
