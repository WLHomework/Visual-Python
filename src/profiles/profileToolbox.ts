import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../pythonBlocks";
import { hardwareToolboxCategory, isHardwareToolboxCategoryName, setActiveHardwareBoard } from "../hardware/hardwareBlocks";
import { boardToolboxSpec, hardwareBlockEntries } from "../hardware/toolboxes";
import { resolveBoardToolbox } from "../hardware/toolboxes/resolve";
import { isHardwareWorkbench, type WorkbenchProfile } from "./workbenchProfile";

const baseCategoryNames = new Set(
  ((baseToolbox as unknown as { contents?: Array<{ kind?: string; name?: string }> }).contents ?? [])
    .filter((item) => item.kind === "category" && typeof item.name === "string")
    .map((item) => item.name as string),
);

const hardwareHiddenCategories = new Set(["文件", "模块", "现代语法", "异步"]);
const hardwareHiddenBlockTypes = new Set([
  "python_input",
  "python_input_assign",
  "python_input_typed_assign",
  "python_input_many_assign",
  "python_pprint",
  "python_sys_argv",
  "python_sys_exit",
  "python_csv_read",
  "python_csv_write",
  "python_datetime_now",
  "python_datetime_parse",
  "python_datetime_format",
  "python_datetime_timedelta",
  "python_os_getenv",
  "python_path_create",
  "python_path_join",
  "python_path_check",
  "python_path_read_text",
  "python_path_write_text",
  "python_os_getcwd",
  "python_os_listdir",
  "python_os_makedirs",
  "python_random_sample",
  "python_random_shuffle",
  "python_collections_counter",
  "python_collections_defaultdict",
  "python_collections_deque",
  "python_collections_namedtuple",
  "python_deque_add",
  "python_deque_pop",
  "python_counter_most_common",
  "python_file_read_text",
  "python_file_write_text",
  "python_open_file",
  "python_file_read",
  "python_file_write",
  "python_file_tell",
  "python_file_seek",
  "python_file_control",
  "python_file_exists",
  "python_directory_exists",
  "python_path_info",
  "python_directory_find",
  "python_file_copy",
  "python_file_move",
  "python_file_delete",
  "python_directory_copy",
  "python_directory_move",
  "python_directory_remove",
]);

type ToolboxItem = { kind?: string; type?: string; name?: string; contents?: ToolboxItem[] };

function filterHardwareToolboxItems(items: ToolboxItem[]): ToolboxItem[] {
  return items.filter((item) => !item.type || !hardwareHiddenBlockTypes.has(item.type));
}

function filterHardwareCategory(item: ToolboxItem): ToolboxItem | null {
  if (item.kind !== "category" || typeof item.name !== "string") return item;
  if (hardwareHiddenCategories.has(item.name)) return null;
  if (!Array.isArray(item.contents)) return item;
  return { ...item, contents: filterHardwareToolboxItems(item.contents) };
}

/** 激活 Profile：硬件 Profile 会激活板卡档案（引脚取值与代码生成），Python Profile 清空板卡但保留积木数据。 */
export function activateWorkbenchProfile(profile: WorkbenchProfile): void {
  setActiveHardwareBoard(isHardwareWorkbench(profile) ? profile.boardId : undefined);
}

/**
 * 按 Profile 组装工具箱。
 *
 * Python Profile 保持工具箱原样（含插件分类）；硬件 Profile 里：
 * - 有专属工具箱声明的板卡按声明组装，传入的工具箱（可能已被插件扩展）被完全忽略；
 * - 还没有声明的板卡沿用旧的隐藏名单：只保留内置 Python 分类并把「硬件」分类放在最前。
 */
export function buildProfileToolbox(toolbox: Blockly.utils.toolbox.ToolboxDefinition, profile: WorkbenchProfile): Blockly.utils.toolbox.ToolboxDefinition {
  if (!isHardwareWorkbench(profile)) return toolbox;
  const spec = boardToolboxSpec(profile.boardId);
  if (spec) {
    return resolveBoardToolbox(spec, { baseToolbox, hardwareEntries: hardwareBlockEntries(profile.boardId) });
  }
  const definition = toolbox as unknown as { kind?: string; contents?: Array<{ kind?: string; name?: string }> };
  if (!Array.isArray(definition.contents)) return toolbox;
  const kept = definition.contents.filter((item) => {
    if (item.kind !== "category") return true;
    if (isHardwareToolboxCategoryName(item.name)) return false;
    return typeof item.name === "string" && baseCategoryNames.has(item.name);
  }).map(filterHardwareCategory).filter((item): item is NonNullable<typeof item> => item !== null);
  return {
    ...definition,
    contents: [hardwareToolboxCategory(profile.boardId), ...kept],
  } as unknown as Blockly.utils.toolbox.ToolboxDefinition;
}
