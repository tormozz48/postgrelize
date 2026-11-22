import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  baselineFrom,
  compareWithBaseline,
  type Baseline,
  type FileResult,
} from './compare-lib.ts';
import { prepare, WORK } from './prepare.ts';

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8')) as Readonly<{
  tag: string;
  workers: number;
  fileTimeoutMs: number;
  mochaTimeoutMs: number;
}>;
const BASELINE = join(here, 'baseline.json');
const DEV_DATABASE_PORT = '54329';

// v6's tests drop every table, enum and schema of their database and one of them crashed a backend
// of the development server once: the suite only runs against a server of its own (`db.sh`).
const databaseUrl = (): URL => {
  const url = new URL(
    process.env.PGZ_V6_DB_URL ?? 'postgres://postgres:postgres@localhost:54399/postgres',
  );
  if (url.port === DEV_DATABASE_PORT) {
    throw new Error(
      `refusing to run on port ${DEV_DATABASE_PORT} (the development database); use scripts/v6-suite/db.sh`,
    );
  }
  return url;
};

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

const runFile = (
  work: string,
  file: string,
  database: string,
  url: URL,
  out: string,
): Promise<FileResult> =>
  new Promise((done) => {
    const child = spawn(
      join(work, 'node_modules/.bin/mocha'),
      [
        '-r',
        './register.cjs',
        '--reporter',
        join(work, 'reporter.cjs'),
        '--timeout',
        String(config.mochaTimeoutMs),
        '--exit',
        file,
      ],
      {
        cwd: work,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: {
          ...process.env,
          DIALECT: 'postgres',
          SEQ_PG_HOST: url.hostname,
          SEQ_PG_PORT: url.port,
          SEQ_PG_USER: decodeURIComponent(url.username),
          SEQ_PG_PW: decodeURIComponent(url.password),
          SEQ_PG_DB: database,
          V6_SUITE_OUT: out,
        },
      },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString();
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), config.fileTimeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      if (existsSync(out)) {
        const result = JSON.parse(readFileSync(out, 'utf8')) as FileResult;
        done({
          pass: result.pass,
          pending: result.pending,
          failing: result.failing,
          messages: result.messages,
        });
        return;
      }
      const line = stderr.split('\n').find((text) => /Error/.test(text)) ?? stderr.slice(0, 120);
      done({
        pass: 0,
        pending: 0,
        failing: [],
        loadError: line.replaceAll(work, '').trim().slice(0, 160),
      });
    });
  });

const runAll = async (
  work: string,
  files: readonly string[],
  url: URL,
  workers: number,
): Promise<Record<string, FileResult>> => {
  const admin = new Client({ connectionString: url.href });
  await admin.connect();
  const databases = Array.from({ length: workers }, (_, index) => `v6_suite_w${index}`);
  for (const name of databases) {
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.query(`CREATE DATABASE ${name}`);
    // tests of the hstore type expect the extension (contrib, shipped with the postgres image)
    const database = new Client({ connectionString: new URL(`/${name}`, url).href });
    await database.connect();
    await database.query('CREATE EXTENSION IF NOT EXISTS hstore');
    await database.end();
  }
  const results: Record<string, FileResult> = {};
  const outDir = join(WORK, 'results');
  mkdirSync(outDir, { recursive: true });
  let next = 0;
  await Promise.all(
    databases.map(async (database) => {
      while (next < files.length) {
        const file = files[next++] as string;
        const key = relative(work, file);
        results[key] = await runFile(
          work,
          key,
          database,
          url,
          join(outDir, `${key.replaceAll('/', '__')}.json`),
        );
      }
    }),
  );
  for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.end();
  return results;
};

const main = async (): Promise<number> => {
  const [kind = 'integration', ...flags] = process.argv.slice(2);
  const filter = flags.find((flag) => flag.startsWith('--filter='))?.slice('--filter='.length);
  const url = databaseUrl();
  const work = prepare();
  rmSync(join(WORK, 'results'), { recursive: true, force: true });
  const files = walk(join(work, 'test', kind))
    .filter(
      (file) =>
        file.endsWith('.test.js') && (filter === undefined || new RegExp(filter).test(file)),
    )
    .toSorted();
  let results = await runAll(work, files, url, config.workers);
  if (flags.includes('--update-baseline')) {
    // two runs: files whose failures vary between them are recorded as unstable
    const merged = baselineFrom(
      config.tag.slice(1),
      results,
      await runAll(work, files, url, config.workers),
    );
    const previous: Baseline = existsSync(BASELINE)
      ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline)
      : { version: merged.version, files: {} };
    const kept = Object.fromEntries(
      Object.entries(previous.files).filter(([file]) => !file.startsWith(`test/${kind}/`)),
    );
    writeFileSync(
      BASELINE,
      `${JSON.stringify({ version: merged.version, files: { ...kept, ...merged.files } }, null, 1)}\n`,
    );
    console.log(`baseline updated for test/${kind}`);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
  const scoped: Baseline = {
    ...baseline,
    files: Object.fromEntries(
      Object.entries(baseline.files).filter(
        ([file]) =>
          file.startsWith(`test/${kind}/`) &&
          (filter === undefined || new RegExp(filter).test(file)),
      ),
    ),
  };
  let comparison = compareWithBaseline(scoped, results);
  // Timeouts under load look like regressions: run the affected files once more, one at a time.
  const suspects = [...new Set(comparison.regressions.map((line) => line.split(':')[0] as string))];
  if (suspects.length > 0) {
    const again = await runAll(
      work,
      suspects.map((file) => resolve(work, file)),
      url,
      1,
    );
    results = { ...results, ...again };
    comparison = compareWithBaseline(scoped, results);
  }
  // every result with its messages, for triage (`.v6-suite/last-run-<kind>.json`)
  writeFileSync(join(WORK, `last-run-${kind}.json`), JSON.stringify(results));
  console.log(
    JSON.stringify({
      kind,
      tag: config.tag,
      passed: comparison.passed,
      failed: comparison.failed,
      loaded: comparison.loaded,
      notLoaded: comparison.notLoaded,
      regressions: comparison.regressions.length,
      stale: comparison.stale.length,
    }),
  );
  for (const line of comparison.regressions.slice(0, 50)) console.log(`REGRESSION ${line}`);
  for (const line of comparison.stale.slice(0, 20)) console.log(`STALE ${line}`);
  return comparison.regressions.length > 0 ||
    (flags.includes('--strict') && comparison.stale.length > 0)
    ? 1
    : 0;
};

process.exitCode = await main();
