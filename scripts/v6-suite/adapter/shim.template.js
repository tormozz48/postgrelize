'use strict';
const entry = require('__POSTGRELIZE_ENTRY__');
const Sequelize = entry.Sequelize;
module.exports = new Proxy(Sequelize, {
  get: (target, key) =>
    key === 'default' ? module.exports : key in target ? target[key] : entry[key],
});
