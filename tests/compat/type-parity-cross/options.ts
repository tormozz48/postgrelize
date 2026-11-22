import type * as V6 from '@v6';
import type * as PG from '@orm';

// Resolves to the v6 keys that the postgrelize type lacks; `never` when it covers them all.
type MissingKeys<TV6, TPG> = Exclude<keyof TV6, keyof TPG>;
declare function noMissingKeys<T extends never>(): T;

noMissingKeys<MissingKeys<V6.FindOptions, PG.FindOptions>>();
noMissingKeys<MissingKeys<V6.NonNullFindOptions, PG.FindOptions>>();
noMissingKeys<MissingKeys<V6.CountOptions, PG.CountOptions>>();
noMissingKeys<MissingKeys<V6.FindAndCountOptions, PG.FindAndCountOptions>>();
noMissingKeys<MissingKeys<V6.CreateOptions, PG.CreateOptions>>();
noMissingKeys<MissingKeys<V6.FindOrCreateOptions, PG.FindOrCreateOptions>>();
noMissingKeys<MissingKeys<V6.UpsertOptions, PG.UpsertOptions>>();
noMissingKeys<MissingKeys<V6.BulkCreateOptions, PG.BulkCreateOptions>>();
noMissingKeys<MissingKeys<V6.DestroyOptions, PG.DestroyOptions>>();
noMissingKeys<MissingKeys<V6.RestoreOptions, PG.RestoreOptions>>();
noMissingKeys<MissingKeys<V6.UpdateOptions, PG.UpdateOptions>>();
noMissingKeys<MissingKeys<V6.InstanceDestroyOptions, PG.InstanceDestroyOptions>>();
noMissingKeys<MissingKeys<V6.SaveOptions, PG.SaveOptions>>();
noMissingKeys<MissingKeys<V6.BuildOptions, PG.BuildOptions>>();
noMissingKeys<MissingKeys<V6.InitOptions, PG.InitOptions>>();
noMissingKeys<MissingKeys<V6.IncrementDecrementOptions, PG.IncrementOptions>>();
noMissingKeys<MissingKeys<V6.TruncateOptions, PG.DestroyOptions>>();
noMissingKeys<MissingKeys<V6.IncludeOptions, PG.IncludeOptions>>();
