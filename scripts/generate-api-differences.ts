import { readFileSync, writeFileSync } from 'node:fs';
import {
  END_MARKER,
  renderApiDifferences,
  START_MARKER,
  type SurfaceExceptions,
} from './api-differences-lib.ts';

const exceptions = JSON.parse(
  readFileSync('tests/compat/api-surface-exceptions.json', 'utf8'),
) as SurfaceExceptions;
const page = 'docs/guide/migrating.md';
const text = readFileSync(page, 'utf8');
const start = text.indexOf(START_MARKER);
const end = text.indexOf(END_MARKER);
if (start === -1 || end === -1) throw new Error(`Markers missing in ${page}`);
writeFileSync(
  page,
  text.slice(0, start) + renderApiDifferences(exceptions) + text.slice(end + END_MARKER.length),
);
