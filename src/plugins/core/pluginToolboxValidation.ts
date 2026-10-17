/**
 * 校验插件工具箱分类里引用的积木类型（含输入影子积木）是否真实存在。
 *
 * 该检查对应插件流程声明的 `toolbox_references` 阶段：插件的 activate(context) 完成后，
 * 由宿主用真实注册表（Blockly.Blocks + 插件注册的积木）作为存在性判断，避免工具箱
 * 引用未注册类型导致工具箱渲染或积木实例化失败。
 */

export type PluginToolboxReferenceIssue = {
  category: string;
  path: string;
  blockType?: string;
  message: string;
  suggestion: string;
};

type ToolboxCategoryLike = {
  id?: string;
  name?: string;
  contents?: ReadonlyArray<Record<string, unknown>>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const categoryLabel = (category: ToolboxCategoryLike): string =>
  (typeof category.name === "string" && category.name.trim())
  || (typeof category.id === "string" && category.id.trim())
  || "未命名分类";

export function validatePluginToolboxReferences(
  categories: ReadonlyArray<ToolboxCategoryLike>,
  hasBlockType: (type: string) => boolean,
): PluginToolboxReferenceIssue[] {
  const issues: PluginToolboxReferenceIssue[] = [];

  const visitInputs = (category: string, inputs: unknown, ownerPath: string): void => {
    if (!isRecord(inputs)) return;
    for (const [inputName, inputValue] of Object.entries(inputs)) {
      if (!isRecord(inputValue)) continue;
      const shadow = inputValue.shadow;
      if (!isRecord(shadow)) continue;
      const shadowPath = `${ownerPath}.inputs.${inputName}.shadow`;
      const shadowType = typeof shadow.type === "string" ? shadow.type.trim() : "";
      if (!shadowType) continue;
      if (!hasBlockType(shadowType)) {
        issues.push({
          category,
          path: shadowPath,
          blockType: shadowType,
          message: `工具箱分类「${category}」输入 ${inputName} 的影子积木类型未注册：${shadowType}`,
          suggestion: "注册该积木，或把影子积木改为宿主已有的类型（如 math_number、text、logic_boolean）",
        });
        continue;
      }
      visitInputs(category, shadow.inputs, shadowPath);
    }
  };

  const visitItems = (category: string, items: ReadonlyArray<unknown>, path: string): void => {
    items.forEach((item, index) => {
      if (!isRecord(item)) return;
      const itemPath = `${path}[${index}]`;
      if (item.kind === "category" && Array.isArray(item.contents)) {
        visitItems(category, item.contents, `${itemPath}.contents`);
        return;
      }
      const type = typeof item.type === "string" ? item.type.trim() : "";
      if (type && !hasBlockType(type)) {
        issues.push({
          category,
          path: itemPath,
          blockType: type,
          message: `工具箱分类「${category}」引用了未注册的积木类型：${type}`,
          suggestion: `在 activate(context) 中通过 context.registerBlock() 注册 ${type}，或修正工具箱条目的 type`,
        });
      } else if (!type && item.kind === "block") {
        issues.push({
          category,
          path: itemPath,
          message: `工具箱分类「${category}」的积木条目缺少字符串 type`,
          suggestion: "为工具箱块条目补充真实的积木类型",
        });
      }
      visitInputs(category, item.inputs, itemPath);
    });
  };

  for (const category of categories) {
    visitItems(categoryLabel(category), category.contents ?? [], "contents");
  }
  return issues;
}
