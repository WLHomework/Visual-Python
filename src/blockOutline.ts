import * as Blockly from "blockly/core";

export type BlockOutlineKind = "scene" | "function" | "class" | "control" | "statement";

export type BlockOutlineNode = {
  id: string;
  type: string;
  label: string;
  kind: BlockOutlineKind;
  collapsed: boolean;
  issueCount: number;
  blockCount: number;
  children: BlockOutlineNode[];
};

const kindForBlock = (type: string): BlockOutlineKind => {
  if (type.includes("manim_scene")) return "scene";
  if (/(?:^|_)(?:function|method)(?:_|$)/.test(type)) return "function";
  if (/(?:^|_)class(?:_|$)/.test(type)) return "class";
  if (/(?:controls_|for_|while|loop|try_|with|match|conditional)/.test(type)) return "control";
  return "statement";
};

const cleanLabel = (block: Blockly.Block) => block.toString(90, "").replace(/\s+/g, " ").trim() || block.type.replaceAll("_", " ");

export function buildBlockOutline(workspace: Blockly.Workspace, issueBlockIds: ReadonlySet<string> = new Set()): BlockOutlineNode[] {
  const visited = new Set<string>();
  const buildStack = (first: Blockly.Block | null): BlockOutlineNode[] => {
    const nodes: BlockOutlineNode[] = [];
    let block = first;
    while (block && !visited.has(block.id)) {
      visited.add(block.id);
      const children = block.inputList.flatMap((input) => {
        if (input.type !== Blockly.inputs.inputTypes.STATEMENT) return [];
        return buildStack(input.connection?.targetBlock() ?? null);
      });
      const ownIssueCount = issueBlockIds.has(block.id) ? 1 : 0;
      nodes.push({
        id: block.id,
        type: block.type,
        label: cleanLabel(block),
        kind: kindForBlock(block.type),
        collapsed: block.isCollapsed(),
        issueCount: ownIssueCount + children.reduce((total, child) => total + child.issueCount, 0),
        blockCount: 1 + children.reduce((total, child) => total + child.blockCount, 0),
        children,
      });
      block = block.nextConnection?.targetBlock() ?? null;
    }
    return nodes;
  };
  return workspace.getTopBlocks(true).flatMap((block) => buildStack(block));
}

export function filterBlockOutline(nodes: BlockOutlineNode[], query: string): BlockOutlineNode[] {
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  if (!normalized) return nodes;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return nodes.flatMap((node) => {
    const text = `${node.label} ${node.type.replaceAll("_", " ")}`.toLocaleLowerCase();
    if (tokens.every((token) => text.includes(token))) return [node];
    const children = filterBlockOutline(node.children, normalized);
    return children.length ? [{ ...node, children }] : [];
  });
}
