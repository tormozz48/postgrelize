import { describe, expect, it } from 'vitest';
import { DataTypes, Model, Sequelize } from '../../../src/index.ts';
import { registry } from '../../../src/model/model-services.ts';

const NOT_INITIALIZED = 'Model is not initialized. Call Model.init() or sequelize.define() first.';

class Detached extends Model {}

describe('a model class that was never initialized', () => {
  it('fails to resolve its definition, state and owner', () => {
    expect(() => Detached.modelName).toThrow(NOT_INITIALIZED);
    expect(() => registry.state(Detached)).toThrow(NOT_INITIALIZED);
    expect(() => registry.update(Detached, (state) => state)).toThrow(NOT_INITIALIZED);
    expect(() => Detached.sequelize).toThrow('Model is not initialized.');
  });
});

describe('an initialized model', () => {
  const sequelize = new Sequelize('postgres://unused@localhost:1/unused', { logging: false });
  const Note = sequelize.define('Note', { title: DataTypes.STRING }, { timestamps: false });

  it('exposes its name and class from an instance', () => {
    expect(Note.modelName).toBe('Note');
    expect(Note.build({ title: 'a' })._model).toBe(Note);
  });

  it('requires a function when a named hook is added without one', () => {
    expect(() => Note.addHook('beforeCreate', 'named' as never)).toThrow(
      'addHook: hook function is required',
    );
  });

  it('resolves the state of a subclass through its initialized parent', () => {
    class Child extends Note {}
    expect(registry.state(Child)).toBe(registry.state(Note));
    expect(Child.modelName).toBe('Note');
  });
});
