import { afterEach, describe, expect, it } from 'vitest';
import inflection from 'inflection';
import { Sequelize, useInflection } from '../../src/index.ts';
import { inflector } from '../../src/model/inflector.ts';
import pkg from '../../package.json' with { type: 'json' };

afterEach(() => useInflection(inflection));

describe('useInflection', () => {
  it('replaces the inflection used for association names', () => {
    useInflection({ ...inflection, pluralize: (word) => `${word}_all`, singularize: (w) => w });
    expect(inflector.pluralize('post')).toBe('post_all');
    Sequelize.useInflection(inflection);
    expect(inflector.pluralize('post')).toBe('posts');
  });
});

describe('Sequelize.version', () => {
  it('is the package version', () => {
    expect(Sequelize.version).toBe(pkg.version);
  });
});

describe('static aliases', () => {
  it('point at the same members as DataTypes and the error classes', () => {
    expect(Sequelize.STRING).toBe(Sequelize.DataTypes.STRING);
    expect(Sequelize['DOUBLE PRECISION']).toBe(Sequelize.DataTypes['DOUBLE PRECISION']);
    expect(new Sequelize.UniqueConstraintError({ parent: new Error('x') })).toBeInstanceOf(
      Sequelize.ValidationError,
    );
    expect(new Sequelize.QueryError('q')).toBeInstanceOf(Sequelize.Error);
    expect(new Sequelize.UnknownConstraintError().message).toBe(
      'The specified constraint does not exist',
    );
    expect(new Sequelize.SequelizeScopeError('s').name).toBe('SequelizeScopeError');
  });
});
