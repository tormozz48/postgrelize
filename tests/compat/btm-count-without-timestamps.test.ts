import { describe, it } from 'vitest';
import { expectSameResult } from '../support/compat.ts';

const SETUP = `CREATE TABLE users (id serial PRIMARY KEY);
  CREATE TABLE comments (id serial PRIMARY KEY);
  CREATE TABLE uc ("userId" int, "commentId" int);
  INSERT INTO users DEFAULT VALUES; INSERT INTO comments DEFAULT VALUES;
  INSERT INTO uc VALUES (1, 1);`;

describe('compat: count of a belongsToMany whose junction table has no timestamps', () => {
  it('reads no through attributes', () =>
    expectSameResult(SETUP, async (_lib, sequelize) => {
      const options = { timestamps: false };
      const User = sequelize.define('user', {}, options);
      const Comment = sequelize.define('comment', {}, options);
      User.belongsToMany(Comment, { through: { model: 'uc' }, timestamps: true } as never);
      const user = (await User.findOne()) as unknown as {
        countComments(): Promise<number>;
        hasComment(id: number): Promise<boolean>;
      };
      return [await user.countComments(), await user.hasComment(1), await user.hasComment(2)];
    }));
});
