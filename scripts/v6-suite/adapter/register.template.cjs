'use strict';
// Loaded with `mocha -r`. Makes the v6 tests run against postgrelize (adapter, see README.md):
// - `require('sequelize')` is postgrelize (node_modules/sequelize is a small shim package);
// - `require('sequelize/lib/<x>')` maps to the postgrelize equivalent, or fails with a clear error;
// - `sequelize.dialect` carries v6's own PostgreSQL `supports` table, which tests read while describing.
const Module = require('node:module');
const entry = require('__POSTGRELIZE_ENTRY__');
const libMap = {
  'data-types': entry.DataTypes,
  errors: entry,
  operators: entry.Op,
  transaction: entry.Transaction,
  model: entry.Model,
  sequelize: entry.Sequelize,
  'index-hints': entry,
  'table-hints': entry,
  'query-types': entry.QueryTypes,
  'associations/has-many': entry.HasMany,
  'instance-validator': entry.InstanceValidator,
};
/* oxlint-disable no-underscore-dangle -- Module._load is the only hook for deep requires */
const load = Module._load;
Module._load = function (request, ...rest) {
  const match = /^sequelize\/lib\/(.+)$/.exec(request);
  if (match === null) {
    return load.call(this, request, ...rest);
  }
  if (libMap[match[1]]) {
    return libMap[match[1]];
  }
  const error = new Error(
    `[v6-suite adapter] no postgrelize equivalent for sequelize/lib/${match[1]}`,
  );
  error.code = 'MODULE_NOT_FOUND';
  throw error;
};

const { supports } = require('__V6_POSTGRES_DIALECT__').prototype;
const Sequelize = require('sequelize');
Object.defineProperty(Sequelize.prototype, 'dialect', {
  configurable: true,
  get() {
    return { name: 'postgres', supports, queryGenerator: undefined };
  },
});
