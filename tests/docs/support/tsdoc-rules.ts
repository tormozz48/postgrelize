import type { DocItem } from './tsdoc-model.ts';

export interface AllowlistEntry {
  readonly name: string;
  readonly reason: string;
}

const CALLABLE = new Set<DocItem['kind']>(['function', 'method']);
const needsExample = (item: DocItem): boolean =>
  CALLABLE.has(item.kind) ||
  item.kind === 'class' ||
  ((item.kind === 'interface' || item.kind === 'typeAlias') &&
    (item.path.split('.').pop() ?? '').endsWith('Options'));

const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Checks the TSDoc standard of AGENTS.md → "API documentation" for every public item. */
export class TsdocRules {
  constructor(private readonly allowlist: readonly AllowlistEntry[]) {}

  violations(items: readonly DocItem[]): string[] {
    const allowed = new Set(this.allowlist.map((e) => e.name));
    return items.flatMap((item) =>
      this.check(item, allowed.has(item.path)).map(
        (m) => `${item.file}:${item.line} ${item.path}: ${m}`,
      ),
    );
  }

  staleAllowlist(items: readonly DocItem[]): string[] {
    const byPath = new Map(items.map((i) => [i.path, i]));
    return this.allowlist.flatMap((entry) => {
      const item = byPath.get(entry.name);
      if (item === undefined) return [`${entry.name}: not a public item`];
      if (!needsExample(item) || item.examples.length > 0)
        return [`${entry.name}: allowlisted but does not need to be`];
      return entry.reason.trim() === '' ? [`${entry.name}: missing reason`] : [];
    });
  }

  private check(item: DocItem, allowedWithoutExample: boolean): string[] {
    const out: string[] = [];
    const last = item.path.split('.').pop() ?? '';
    if (item.summary === '') out.push('no summary');
    else if (squash(item.summary) === squash(last)) out.push('summary only repeats the name');
    if (needsExample(item) && item.examples.length === 0 && !allowedWithoutExample)
      out.push('no @example');
    for (const param of item.params)
      if (!param.documented) out.push(`no @param for "${param.name}"`);
    if (item.returnsValue && !item.tags.includes('@returns')) out.push('no @returns');
    return out;
  }
}
