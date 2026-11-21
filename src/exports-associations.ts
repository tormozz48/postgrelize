import { Association as AssociationClass } from './associations/association.ts';
import type { Association as AssociationShape } from './associations/types.ts';

/** Description of one association of a model: what `Model.associations` holds and `Model.hasMany()` and friends return. */
export type Association = AssociationShape;
/** Base class of the association classes (`Sequelize.HasOne`, `Sequelize.HasMany`, `Sequelize.BelongsTo`, `Sequelize.BelongsToMany`). */
export const Association = AssociationClass;
