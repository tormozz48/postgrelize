// Self-time per function (and per file) from a .cpuprofile written by `node --cpu-prof`.
import { readFileSync } from 'node:fs';
import { SourceMap } from 'node:module';

type Node = {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  children?: number[];
};
type Origin = { originalSource?: string; originalLine?: number };
type Profile = { nodes: Node[]; samples: number[]; timeDeltas: number[] };

const maps = new Map<string, SourceMap | undefined>();
const mapOf = (url: string): SourceMap | undefined => {
  if (!maps.has(url) && url.startsWith('file://') && url.includes('/dist/')) {
    const path = new URL(url).pathname;
    maps.set(url, new SourceMap(JSON.parse(readFileSync(`${path}.map`, 'utf8'))));
  }
  return maps.get(url);
};
const profile = JSON.parse(readFileSync(process.argv[2] ?? '', 'utf8')) as Profile;
const byId = new Map(profile.nodes.map((node) => [node.id, node]));
const self = new Map<number, number>();
profile.samples.forEach((id, index) => {
  self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[index] ?? 0));
});
const total = [...self.values()].reduce((sum, value) => sum + value, 0);
const functions = new Map<string, number>();
const files = new Map<string, number>();
for (const [id, time] of self) {
  const frame = byId.get(id)?.callFrame;
  if (frame === undefined) {
    continue;
  }
  const origin = mapOf(frame.url)?.findEntry(frame.lineNumber, frame.columnNumber) as
    | Origin
    | undefined;
  const file = origin?.originalSource
    ? origin.originalSource.replace(/^.*\/(src|node_modules|bench)\//, '$1/')
    : frame.url.replace(/^.*\/(dist|node_modules|bench)\//, '$1/') || '(native)';
  const line = origin?.originalLine === undefined ? frame.lineNumber : origin.originalLine;
  const key = `${frame.functionName || '(anonymous)'} ${file}:${line + 1}`;
  functions.set(key, (functions.get(key) ?? 0) + time);
  files.set(file, (files.get(file) ?? 0) + time);
}
const top = (map: Map<string, number>, count: number): void => {
  for (const [key, time] of [...map].toSorted((a, b) => b[1] - a[1]).slice(0, count)) {
    console.log(`${((time / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
  }
};
console.log('== self time by function');
top(functions, Number(process.argv[3] ?? 25));
console.log('== self time by file');
top(files, 12);
