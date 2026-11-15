import { describe, expect, it } from 'vitest';
import { DataTypes, Sequelize } from '../../../src/index.ts';

const loadedNote = () => {
  const sequelize = new Sequelize('postgres://unused@localhost:1/unused', { logging: false });
  const Note = sequelize.define('Note', { title: DataTypes.STRING }, { timestamps: false });
  return Note.build({ id: 1, title: 'one' }, { isNewRecord: false, raw: true });
};

describe('instance change tracking without a database', () => {
  it('starts clean for an instance built from stored values', () => {
    expect(loadedNote().changed()).toBe(false);
  });

  it('keeps an attribute changed after it is set back to its stored value (v6)', () => {
    const note = loadedNote();
    note.set('title', 'uno');
    note.set('title', 'one');
    expect(note.changed()).toEqual(['title']);
  });
});
