/**
 * Top-level blocks of a Terraform file, for tests that pin how a resource is
 * declared.
 *
 * Braces are matched rather than the body guessed by a regex, because blocks
 * nest (a rule's pattern, a policy's statement and condition) and a non-greedy
 * match would stop at the first inner close. Comments are not stripped, so a
 * body assertion that a commented-out line could satisfy anchors to the start
 * of the line.
 */
export interface HclBlock {
  type: string;
  name: string;
  body: string;
}

export function hclBlocks(source: string, kind: 'resource' | 'data'): HclBlock[] {
  const blocks: HclBlock[] = [];
  const header = new RegExp(`^${kind}\\s+"([^"]+)"\\s+"([^"]+)"\\s*\\{`, 'gm');
  let match: RegExpExecArray | null;
  while ((match = header.exec(source)) !== null) {
    let depth = 1;
    let i = header.lastIndex;
    while (depth > 0 && i < source.length) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') depth -= 1;
      i += 1;
    }
    blocks.push({ type: match[1], name: match[2], body: source.slice(header.lastIndex, i - 1) });
  }
  return blocks;
}

/** True when the block declares `provider = <alias>` on a line of its own. */
export function onProvider(block: HclBlock, alias: string): boolean {
  return new RegExp(`^\\s*provider\\s*=\\s*${alias.replace('.', '\\.')}\\s*$`, 'm').test(block.body);
}
