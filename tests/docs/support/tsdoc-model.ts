import { Application, type JSONOutput, normalizePath } from 'typedoc';

type Node = JSONOutput.DeclarationReflection;
type Signature = JSONOutput.SignatureReflection;
type Parts = JSONOutput.CommentDisplayPart[] | undefined;

export interface DocParam {
  readonly name: string;
  readonly documented: boolean;
}

export interface DocItem {
  /** `Name` for top-level items, `Parent.name` for members. */
  readonly path: string;
  readonly kind:
    | 'class'
    | 'constructor'
    | 'function'
    | 'method'
    | 'accessor'
    | 'property'
    | 'interface'
    | 'typeAlias'
    | 'variable';
  readonly file: string;
  readonly line: number;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly examples: readonly string[];
  readonly params: readonly DocParam[];
  readonly returnsValue: boolean;
}

const KINDS: Record<number, DocItem['kind']> = {
  32: 'variable',
  64: 'function',
  128: 'class',
  256: 'interface',
  512: 'constructor',
  1024: 'property',
  2048: 'method',
  262144: 'accessor',
  2097152: 'typeAlias',
};

const joinParts = (parts: Parts): string => (parts ?? []).map((p) => p.text).join('');

const isVoidType = (type: Signature['type']): boolean => {
  if (type === undefined) return true;
  if (type.type === 'intrinsic') return type.name === 'void';
  if (type.type === 'reference' && type.name === 'Promise') {
    const arg = type.typeArguments?.[0];
    return arg?.type === 'intrinsic' && arg.name === 'void';
  }
  return false;
};

/** Reads the public API model that TypeDoc builds from `src/index.ts` into flat {@link DocItem}s. */
export class TsdocModel {
  readonly items: DocItem[] = [];
  readonly exportedNames: string[] = [];

  static async load(): Promise<TsdocModel> {
    const app = await Application.bootstrapWithPlugins({});
    const project = await app.convert();
    if (project === undefined) throw new Error('TypeDoc conversion failed');
    const json = app.serializer.projectToObject(project, normalizePath(process.cwd()));
    return new TsdocModel(json);
  }

  private constructor(json: JSONOutput.ProjectReflection) {
    const seen = new Set<string>();
    for (const child of json.children ?? []) {
      this.exportedNames.push(child.name);
      this.visit(child, '', seen);
    }
  }

  private visit(node: Node, parent: string, seen: Set<string>): void {
    const kind = KINDS[node.kind];
    const source = node.sources?.[0];
    if (kind === undefined || source === undefined || !source.fileName.startsWith('src/')) return;
    const path = parent === '' ? node.name : `${parent}.${node.name}`;
    const key = `${path}@${source.fileName}:${source.line}`;
    if (seen.has(key)) return;
    seen.add(key);
    this.items.push(this.toItem(node, kind, path));
    const members = kind === 'class' || kind === 'interface' ? (node.children ?? []) : [];
    for (const member of members) this.visit(member, node.name, seen);
  }

  private toItem(node: Node, kind: DocItem['kind'], path: string): DocItem {
    const sig = node.signatures?.[0] ?? node.getSignature;
    const comment = sig?.comment ?? node.comment;
    const source = node.sources?.[0];
    const blocks = (node.signatures ?? [node.getSignature ?? node]).flatMap(
      (s) => s.comment?.blockTags ?? [],
    );
    return {
      path,
      kind,
      file: source?.fileName ?? '',
      line: source?.line ?? 0,
      summary: joinParts(comment?.summary).trim(),
      tags: blocks.map((b) => b.tag),
      examples: blocks.filter((b) => b.tag === '@example').map((b) => joinParts(b.content)),
      params: (node.signatures?.[0]?.parameters ?? []).map((p) => ({
        name: p.name,
        documented: joinParts(p.comment?.summary).trim() !== '',
      })),
      returnsValue:
        kind === 'accessor' || kind === 'constructor'
          ? false
          : sig !== undefined && !isVoidType(sig.type),
    };
  }
}
