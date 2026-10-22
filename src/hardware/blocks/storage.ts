import * as Blockly from "blockly/core";
import { boardPinChoices, getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  pinTargetField,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_file_write",
    message0: "写入设备文件 %1 内容 %2",
    args0: [
      { type: "input_value", name: "PATH", check: "String" },
      { type: "input_value", name: "TEXT", check: "String" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.storage,
    tooltip:
      "写入设备闪存里的文本文件。路径以 / 开头，例如 /data.txt，和「设备」面板看到的是同一份文件；不要写 /main.py，否则会影响程序启动。",
  },
  {
    type: "hardware_file_append",
    message0: "追加设备文件 %1 内容 %2",
    args0: [
      { type: "input_value", name: "PATH", check: "String" },
      { type: "input_value", name: "TEXT", check: "String" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.storage,
    tooltip:
      "在设备文本文件末尾追加内容；文件不存在时会自动创建。路径以 / 开头，例如 /log.txt；不要写 /main.py。",
  },
  {
    type: "hardware_file_read",
    message0: "读取设备文件 %1",
    args0: [{ type: "input_value", name: "PATH", check: "String" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.storage,
    tooltip: "读取设备上的文本文件；文件不存在或无法读取时返回空字符串。",
  },
  {
    type: "hardware_file_exists",
    message0: "设备文件 %1 存在",
    args0: [{ type: "input_value", name: "PATH", check: "String" }],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.storage,
    tooltip: "检查设备上是否存在这个文件或目录；路径不存在时返回假，不会抛异常。",
  },
  {
    type: "hardware_file_size",
    message0: "设备文件 %1 大小",
    args0: [{ type: "input_value", name: "PATH", check: "String" }],
    inputsInline: true,
    output: "Number",
    colour: hardwareColours.storage,
    tooltip: "返回文件字节数；文件不存在或无法读取时返回 -1。",
  },
  {
    type: "hardware_sd_card",
    message0: "SD 卡 %1 SCK %2 MOSI %3 MISO %4 CS %5",
    args0: [
      { type: "field_dropdown", name: "ACTION", options: [["挂载到 /sd", "mount"], ["卸载", "unmount"]] },
      { type: "field_dropdown", name: "SCK", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "MOSI", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "MISO", options: [["（请先选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "CS", options: [["（请先选择硬件板卡）", ""]] },
    ],
    inputsInline: false,
    output: "Boolean",
    colour: hardwareColours.storage,
    tooltip:
      "用 SPI 模式挂载或卸载 SD 卡，成功返回真。挂载后可用文件积木读写 /sd/ 下的文件；SPI 使用 slot 2、自定义引脚和 20 MHz。SD 卡与模块必须使用 3.3 V 电平，不要热插拔。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_file_delete",
    message0: "删除设备文件 %1",
    args0: [{ type: "input_value", name: "PATH", check: "String" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.storage,
    tooltip: "删除设备上的文件；文件不存在时不会抛异常。不要删除 /main.py，否则程序无法继续运行。",
  },
  {
    type: "hardware_file_list",
    message0: "列出设备目录 %1",
    args0: [{ type: "input_value", name: "PATH", check: "String" }],
    inputsInline: true,
    output: "Array",
    colour: hardwareColours.storage,
    tooltip: "返回目录里的文件名列表，例如 / 或 /lib；目录不存在时返回空列表。",
  },
  {
    type: "hardware_nvs_set",
    message0: "写入 NVS 键 %1 值 %2",
    args0: [
      { type: "input_value", name: "KEY", check: "String" },
      { type: "input_value", name: "VALUE", check: "String" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.storage,
    tooltip:
      "把文本保存到 NVS，掉电后仍然保留。键最多 15 个 ASCII 字母、数字或下划线，值最多约 1 KB；命名空间固定为 visual_python。",
  },
  {
    type: "hardware_nvs_get",
    message0: "读取 NVS 键 %1",
    args0: [{ type: "input_value", name: "KEY", check: "String" }],
    inputsInline: true,
    output: "String",
    colour: hardwareColours.storage,
    tooltip: "读取 NVS 里的文本；键不存在或内容超过约 1 KB 时返回空字符串。",
  },
  {
    type: "hardware_nvs_delete",
    message0: "删除 NVS 键 %1",
    args0: [{ type: "input_value", name: "KEY", check: "String" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.storage,
    tooltip: "删除 NVS 里的键；键不存在时不会抛异常。删除后立即提交到闪存。",
  },
];

const storageGuard = (): string | undefined => {
  const profile = getActiveHardwareBoard();
  if (!profile) return "请先选择硬件板卡";
  if (!profile.deviceStorage) return `${profile.displayName} 不支持设备存储积木（仅 ESP32-S3）`;
  return undefined;
};

const internals = () => hardwareGenerator as unknown as {
  definitions_: Record<string, string>;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
};

const ensureFileWriteHelper = (): string =>
  internals().provideFunction_("hardware_file_write", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path, text):`,
    "  with open(str(path), \"w\") as file:",
    "    file.write(str(text))",
  ]);

const ensureFileReadHelper = (): string =>
  internals().provideFunction_("hardware_file_read", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path):`,
    "  try:",
    "    with open(str(path), \"r\") as file:",
    "      return file.read()",
    "  except OSError:",
    '    return ""',
  ]);

const ensureFileAppendHelper = (): string =>
  internals().provideFunction_("hardware_file_append", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path, text):`,
    "  try:",
    "    with open(str(path), \"a\") as file:",
    "      file.write(str(text))",
    "    return True",
    "  except OSError:",
    "    return False",
  ]);

const ensureFileExistsHelper = (): string =>
  internals().provideFunction_("hardware_file_exists", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path):`,
    "  try:",
    "    os.stat(str(path))",
    "    return True",
    "  except OSError:",
    "    return False",
  ]);

const ensureFileDeleteHelper = (): string =>
  internals().provideFunction_("hardware_file_delete", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path):`,
    "  try:",
    "    os.remove(str(path))",
    "    return True",
    "  except OSError:",
    "    return False",
  ]);

const ensureFileListHelper = (): string =>
  internals().provideFunction_("hardware_file_list", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path):`,
    "  try:",
    "    return os.listdir(str(path))",
    "  except OSError:",
    "    return []",
  ]);

const ensureFileSizeHelper = (): string =>
  internals().provideFunction_("hardware_file_size", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(path):`,
    "  try:",
    "    return os.stat(str(path))[6]",
    "  except OSError:",
    "    return -1",
  ]);

const ensureSdCardHelper = (): string =>
  internals().provideFunction_("hardware_sd_card", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(action, sck, mosi, miso, cs):`,
    '  if action == "unmount":',
    "    try:",
    '      os.umount("/sd")',
    '      globals()["_sd"] = None',
    "      return True",
    "    except OSError:",
    "      return False",
    "  try:",
    "    sd = machine.SDCard(slot=2, sck=machine.Pin(sck), mosi=machine.Pin(mosi), miso=machine.Pin(miso), cs=machine.Pin(cs), freq=20000000)",
    '    os.mount(sd, "/sd")',
    '    globals()["_sd"] = sd',
    "    return True",
    "  except (OSError, ValueError):",
    "    return False",
  ]);

const ensureNvs = (): void => {
  ensureImport("esp32");
  internals().definitions_.hardware_nvs = '_nvs = esp32.NVS("visual_python")';
};

const ensureNvsSetHelper = (): string =>
  internals().provideFunction_("hardware_nvs_set", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(key, value):`,
    "  _nvs.set_blob(str(key), str(value).encode())",
    "  _nvs.commit()",
  ]);

const ensureNvsGetHelper = (): string =>
  internals().provideFunction_("hardware_nvs_get", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(key):`,
    "  data = bytearray(1024)",
    "  try:",
    "    length = _nvs.get_blob(str(key), data)",
    "  except OSError:",
    '    return ""',
    "  try:",
    "    return bytes(data[:length]).decode()",
    "  except UnicodeError:",
    "    return bytes(data[:length]).hex()",
  ]);

const ensureNvsDeleteHelper = (): string =>
  internals().provideFunction_("hardware_nvs_delete", [
    `def ${internals().FUNCTION_NAME_PLACEHOLDER_}(key):`,
    "  try:",
    "    _nvs.erase_key(str(key))",
    "    _nvs.commit()",
    "    return True",
    "  except OSError:",
    "    return False",
  ]);

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_file_write = (block, generator) => {
    const problem = storageGuard();
    if (problem) return unavailable(problem);
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '""';
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    return `${ensureFileWriteHelper()}(${path}, ${text})\n`;
  };

  hardwareGenerator.forBlock.hardware_file_read = (block, generator) => {
    if (storageGuard()) return ['""', pythonOrder.ATOMIC];
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '""';
    return [`${ensureFileReadHelper()}(${path})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_file_append = (block, generator) => {
    const problem = storageGuard();
    if (problem) return unavailable(problem);
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '""';
    const text = generator.valueToCode(block, "TEXT", pythonOrder.NONE) || '""';
    return `${ensureFileAppendHelper()}(${path}, ${text})\n`;
  };

  hardwareGenerator.forBlock.hardware_file_exists = (block, generator) => {
    if (storageGuard()) return ["False", pythonOrder.ATOMIC];
    ensureImport("os");
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '""';
    return [`${ensureFileExistsHelper()}(${path})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_file_size = (block, generator) => {
    if (storageGuard()) return ["-1", pythonOrder.ATOMIC];
    ensureImport("os");
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '""';
    return [`${ensureFileSizeHelper()}(${path})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_sd_card = (block) => {
    if (storageGuard()) return ["False", pythonOrder.ATOMIC];
    ensureImport("machine");
    ensureImport("os");
    const helper = ensureSdCardHelper();
    const action = block.getFieldValue("ACTION") === "unmount" ? "unmount" : "mount";
    if (action === "unmount") return [`${helper}("unmount", 0, 0, 0, 0)`, pythonOrder.FUNCTION_CALL];
    const targets = ["SCK", "MOSI", "MISO", "CS"].map((field) =>
      pinTargetField(block, field === "MISO" ? "digital-input" : "digital-output", field));
    const failure = targets.find((target) => typeof target === "string");
    if (typeof failure === "string") return ["False", pythonOrder.ATOMIC];
    const pins = targets.map((target) => (typeof target === "string" ? "" : target.pinId));
    if (new Set(pins).size < 4) return unavailable("SD 卡的 SCK、MOSI、MISO、CS 必须使用不同引脚");
    return [`${helper}("mount", ${pins.join(", ")})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_file_delete = (block, generator) => {
    const problem = storageGuard();
    if (problem) return unavailable(problem);
    ensureImport("os");
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '""';
    return `${ensureFileDeleteHelper()}(${path})\n`;
  };

  hardwareGenerator.forBlock.hardware_file_list = (block, generator) => {
    if (storageGuard()) return ["[]", pythonOrder.ATOMIC];
    ensureImport("os");
    const path = generator.valueToCode(block, "PATH", pythonOrder.NONE) || '"/"';
    return [`${ensureFileListHelper()}(${path})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_nvs_set = (block, generator) => {
    const problem = storageGuard();
    if (problem) return unavailable(problem);
    ensureNvs();
    const key = generator.valueToCode(block, "KEY", pythonOrder.NONE) || '""';
    const value = generator.valueToCode(block, "VALUE", pythonOrder.NONE) || '""';
    return `${ensureNvsSetHelper()}(${key}, ${value})\n`;
  };

  hardwareGenerator.forBlock.hardware_nvs_get = (block, generator) => {
    if (storageGuard()) return ['""', pythonOrder.ATOMIC];
    ensureNvs();
    const key = generator.valueToCode(block, "KEY", pythonOrder.NONE) || '""';
    return [`${ensureNvsGetHelper()}(${key})`, pythonOrder.FUNCTION_CALL];
  };

  hardwareGenerator.forBlock.hardware_nvs_delete = (block, generator) => {
    const problem = storageGuard();
    if (problem) return unavailable(problem);
    ensureNvs();
    const key = generator.valueToCode(block, "KEY", pythonOrder.NONE) || '""';
    return `${ensureNvsDeleteHelper()}(${key})\n`;
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.deviceStorage) return [];
  const text = (value: string) => ({ shadow: { type: "text", fields: { TEXT: value } } });
  const contents: unknown[] = [
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("设备存储"),
    {
      kind: "block",
      type: "hardware_file_write",
      inputs: { PATH: text("/data.txt"), TEXT: text("Hello") },
    },
    {
      kind: "block",
      type: "hardware_file_append",
      inputs: { PATH: text("/log.txt"), TEXT: text("line") },
    },
    { kind: "block", type: "hardware_file_read", inputs: { PATH: text("/data.txt") } },
    { kind: "block", type: "hardware_file_exists", inputs: { PATH: text("/data.txt") } },
    { kind: "block", type: "hardware_file_size", inputs: { PATH: text("/data.txt") } },
    { kind: "block", type: "hardware_file_delete", inputs: { PATH: text("/data.txt") } },
    { kind: "block", type: "hardware_file_list", inputs: { PATH: text("/") } },
    { kind: "block", type: "hardware_nvs_set", inputs: { KEY: text("counter"), VALUE: text("1") } },
    { kind: "block", type: "hardware_nvs_get", inputs: { KEY: text("counter") } },
    { kind: "block", type: "hardware_nvs_delete", inputs: { KEY: text("counter") } },
  ];
  if (profile.p2Modules) {
    const outputs = boardPinChoices(profile, "digital-output").map((pin) => pin.id);
    const inputs = boardPinChoices(profile, "digital-input").map((pin) => pin.id);
    const used = outputs.slice(0, 3);
    const input = inputs.find((id) => !used.includes(id)) ?? inputs[0] ?? "";
    contents.push({
      kind: "block",
      type: "hardware_sd_card",
      fields: { ACTION: "mount", SCK: used[0] ?? "", MOSI: used[1] ?? "", MISO: input, CS: used[2] ?? "" },
    });
  }
  return contents as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
