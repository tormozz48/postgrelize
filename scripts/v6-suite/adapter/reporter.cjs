'use strict';
// Mocha reporter: one JSON result per test file, written to $V6_SUITE_OUT.
const fs = require('node:fs');
const Mocha = require('mocha');
const { EVENT_RUN_END, EVENT_TEST_PASS, EVENT_TEST_FAIL, EVENT_TEST_PENDING } =
  Mocha.Runner.constants;

module.exports = function Reporter(runner) {
  Mocha.reporters.Base.call(this, runner);
  const out = { pass: 0, pending: 0, failing: [], messages: {} };
  runner.on(EVENT_TEST_PASS, () => {
    out.pass += 1;
  });
  runner.on(EVENT_TEST_PENDING, () => {
    out.pending += 1;
  });
  runner.on(EVENT_TEST_FAIL, (test, error) => {
    const title = test.fullTitle();
    out.failing.push(title);
    out.messages[title] =
      `${error && error.name}: ${String((error && error.message) || '').slice(0, 300)}`;
  });
  runner.on(EVENT_RUN_END, () => {
    fs.writeFileSync(process.env.V6_SUITE_OUT, JSON.stringify(out));
  });
};
