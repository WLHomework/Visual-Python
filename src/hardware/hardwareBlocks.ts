import * as Blockly from "blockly/core";
import { pythonGenerator } from "blockly/python";
import { Order } from "blockly/python";
import { localizeBlockDefinitions } from "../blockDisplayLocalization";
import {
  boardPinChoices,
  builtinLedPin,
  getBoardProfile,
  validateBoardPin,
  type BoardProfile,
  type HardwarePinUse,
} from "./boardProfiles";
import type { HardwareBoardId } from "./firmwareCatalog";

/**
 * 硬件积木与 MicroPython 代码生成。
 *
 * 生成的代码面向设备端 MicroPython：用 `machine` 模块操作引脚，用
 * `time.sleep_ms` 做毫秒等待，最终写入设备上的 main.py 并直接运行。
 *
 * 注意：引脚下拉按当前板卡动态生成，所以界面必须在载入工程之前调用
 * `setActiveHardwareBoard`，否则引脚取值会因为无法匹配而回落成默认值。
 */
export const hardwareToolboxCategoryName = "硬件";

const hardwareColours = {
  pin: "#b95073",
  pwm: "#c58b32",
  analog: "#7657b5",
  board: "#2f9e8f",
  loop: "#4b9b62",
};

const pinUseByBlockType: Record<string, HardwarePinUse> = {
  hardware_pin_write: "digital-output",
  hardware_pin_read: "digital-input",
  hardware_pwm_write: "pwm",
  hardware_analog_read: "analog",
};

const hardwareBlockLabels: Record<string, string> = {
  hardware_pin_write: "设置数字引脚",
  hardware_pin_read: "读取数字引脚",
  hardware_pwm_write: "设置 PWM 输出",
  hardware_analog_read: "读取模拟输入",
  hardware_builtin_led: "板载 LED",
  hardware_sleep_ms: "等待毫秒",
  hardware_forever: "永远重复",
};

export const hardwareBlockTypes: readonly string[] = Object.keys(hardwareBlockLabels);

export function isHardwareBlockType(type: string): boolean {
  return Boolean(hardwareBlockLabels[type]);
}

/** 当前工程使用的板卡档案；由界面在运行目标或板卡变化时设置。 */
let activeBoard: BoardProfile | undefined;

export function setActiveHardwareBoard(boardId: HardwareBoardId | undefined): BoardProfile | undefined {
  activeBoard = getBoardProfile(boardId);
  return activeBoard;
}

export function getActiveHardwareBoard(): BoardProfile | undefined {
  return activeBoard;
}

const pinFieldOptions = (use: HardwarePinUse): Array<[string, string]> => {
  const choices = boardPinChoices(activeBoard, use);
  if (choices.length === 0) return [["（请选择硬件板卡）", ""]];
  return choices.map((pin) => [pin.label, pin.id] as [string, string]);
};

/** 按当前板卡刷新某个积木的引脚下拉；返回是否处理了该积木。 */
function applyBoardPinOptions(block: Blockly.Block): boolean {
  const use = pinUseByBlockType[block.type];
  if (!use) return false;
  const field = block.getField("PIN") as Blockly.FieldDropdown | null;
  if (!field) return false;
  const options = pinFieldOptions(use);
  field.setOptions(options);
  const values = options.map((option) => option[1]);
  if (!values.includes(String(field.getValue() ?? ""))) field.setValue(values[0]);
  return true;
}

/** 板卡切换后刷新工作区里全部硬件积木的引脚选项。 */
export function refreshHardwareBlocks(workspace: Blockly.Workspace): number {
  let updated = 0;
  for (const block of workspace.getAllBlocks(false)) {
    if (applyBoardPinOptions(block)) updated += 1;
  }
  return updated;
}

/** 换板卡后会被改成默认引脚的积木个数；用于切换前的确认提示。 */
export function countIncompatiblePins(workspace: Blockly.Workspace | null | undefined, boardId: HardwareBoardId): number {
  const profile = getBoardProfile(boardId);
  if (!workspace || !profile) return 0;
  let count = 0;
  for (const block of workspace.getAllBlocks(false)) {
    const use = pinUseByBlockType[block.type];
    if (!use) continue;
    const pinId = String(block.getFieldValue("PIN") ?? "");
    if (!boardPinChoices(profile, use).some((pin) => pin.id === pinId)) count += 1;
  }
  return count;
}

interface HardwareGeneratorInternals {
  definitions_: Record<string, string>;
  INDENT: string;
  FUNCTION_NAME_PLACEHOLDER_: string;
  provideFunction_(name: string, code: string[]): string;
}

const hardwareInternals = () => pythonGenerator as unknown as HardwareGeneratorInternals;

const ensureImport = (moduleName: string) => {
  hardwareInternals().definitions_[`import_${moduleName}`] = `import ${moduleName}`;
};

const unavailable = (reason: string) => `# 硬件积木未生成代码：${reason}\n`;

/** PWM 对象必须保持引用，否则设备端可能被垃圾回收后停止输出。 */
const ensurePwmHelper = (): string => {
  const internals = hardwareInternals();
  internals.definitions_.hardware_pwm_channels = "_pwm_channels = {}";
  return internals.provideFunction_("hardware_set_pwm", [
    `def ${internals.FUNCTION_NAME_PLACEHOLDER_}(pin, freq, duty):`,
    "  pwm = _pwm_channels.get(pin)",
    "  if pwm is None:",
    "    pwm = machine.PWM(machine.Pin(pin), freq=freq, duty=duty)",
    "    _pwm_channels[pin] = pwm",
    "  else:",
    "    pwm.freq(freq)",
    "    pwm.duty(duty)",
  ]);
};

type PinTarget = { profile: BoardProfile; pinId: string };

const pinTarget = (block: Blockly.Block, use: HardwarePinUse): PinTarget | string => {
  if (!activeBoard) return unavailable("请先选择硬件板卡");
  const pinId = String(block.getFieldValue("PIN") ?? "");
  const problem = validateBoardPin(activeBoard, use, pinId);
  if (problem) return unavailable(problem);
  return { profile: activeBoard, pinId };
};

const hardwareBlockDefinitions = [
  {
    type: "hardware_pin_write",
    message0: "设置引脚 %1 输出 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "LEVEL", options: [["高电平", "1"], ["低电平", "0"]] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pin,
    tooltip: "让选中的引脚输出高电平（约 3.3V）或低电平（0V）。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_pin_read",
    message0: "读取引脚 %1 电平 %2",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请选择硬件板卡）", ""]] },
      { type: "field_dropdown", name: "PULL", options: [["不使用", "none"], ["上拉", "up"], ["下拉", "down"]] },
    ],
    inputsInline: true,
    output: "Boolean",
    colour: hardwareColours.pin,
    tooltip: "读取引脚当前的高低电平，返回真或假。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_pwm_write",
    message0: "设置引脚 %1 PWM 频率 %2 Hz 占空比 %3",
    args0: [
      { type: "field_dropdown", name: "PIN", options: [["（请选择硬件板卡）", ""]] },
      { type: "input_value", name: "FREQ", check: "Number" },
      { type: "input_value", name: "DUTY", check: "Number" },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.pwm,
    tooltip: "输出 PWM 信号，占空比越大输出越强，可用来调光或调速。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_analog_read",
    message0: "读取模拟引脚 %1",
    args0: [{ type: "field_dropdown", name: "PIN", options: [["（请选择硬件板卡）", ""]] }],
    output: "Number",
    colour: hardwareColours.analog,
    tooltip: "读取模拟电压数值，可用于电位器、光敏电阻等元件。",
    extensions: ["hardware_board_pin"],
  },
  {
    type: "hardware_builtin_led",
    message0: "板载 LED %1",
    args0: [{ type: "field_dropdown", name: "STATE", options: [["点亮", "on"], ["熄灭", "off"]] }],
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.board,
    tooltip: "控制开发板自带的 LED。",
  },
  {
    type: "hardware_sleep_ms",
    message0: "等待 %1 毫秒",
    args0: [{ type: "input_value", name: "MS", check: "Number" }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.loop,
    tooltip: "让程序暂停指定的毫秒数，1000 毫秒等于 1 秒。",
  },
  {
    type: "hardware_forever",
    message0: "永远重复执行",
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    previousStatement: null,
    nextStatement: null,
    colour: hardwareColours.loop,
    tooltip: "设备上的程序会一直重复运行这里的积木，直到停止或断电。",
  },
];

let hardwareBlocksRegistered = false;

export function registerHardwareBlocks(): void {
  if (hardwareBlocksRegistered) return;
  hardwareBlocksRegistered = true;

  Blockly.Extensions.register("hardware_board_pin", function (this: Blockly.Block) {
    applyBoardPinOptions(this);
  });
  Blockly.common.defineBlocksWithJsonArray(localizeBlockDefinitions(hardwareBlockDefinitions));

  pythonGenerator.forBlock.hardware_pin_write = (block) => {
    const target = pinTarget(block, "digital-output");
    if (typeof target === "string") return target;
    ensureImport("machine");
    const level = block.getFieldValue("LEVEL") === "0" ? 0 : 1;
    return `machine.Pin(${target.pinId}, machine.Pin.OUT).value(${level})\n`;
  };

  pythonGenerator.forBlock.hardware_pin_read = (block) => {
    const target = pinTarget(block, "digital-input");
    if (typeof target === "string") return ["None", Order.ATOMIC];
    ensureImport("machine");
    const pull = block.getFieldValue("PULL");
    const pullMode = pull === "up" ? ", machine.Pin.PULL_UP" : pull === "down" ? ", machine.Pin.PULL_DOWN" : "";
    return [`machine.Pin(${target.pinId}, machine.Pin.IN${pullMode}).value()`, Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock.hardware_pwm_write = (block, generator) => {
    const target = pinTarget(block, "pwm");
    if (typeof target === "string") return target;
    ensureImport("machine");
    const freq = generator.valueToCode(block, "FREQ", Order.NONE) || String(target.profile.pwmFrequencyHz);
    const duty = generator.valueToCode(block, "DUTY", Order.NONE) || String(Math.round(target.profile.pwmDutyMax / 2));
    return `${ensurePwmHelper()}(${target.pinId}, ${freq}, ${duty})\n`;
  };

  pythonGenerator.forBlock.hardware_analog_read = (block) => {
    const target = pinTarget(block, "analog");
    if (typeof target === "string") return ["None", Order.ATOMIC];
    ensureImport("machine");
    if (target.profile.analogRead === "adc0") return ["machine.ADC(0).read()", Order.FUNCTION_CALL];
    return [`machine.ADC(machine.Pin(${target.pinId})).read()`, Order.FUNCTION_CALL];
  };

  pythonGenerator.forBlock.hardware_builtin_led = (block) => {
    if (!activeBoard) return unavailable("请先选择硬件板卡");
    const pin = builtinLedPin(activeBoard);
    if (!pin) return unavailable(`${activeBoard.displayName} 没有板载 LED`);
    ensureImport("machine");
    const on = block.getFieldValue("STATE") !== "off";
    const level = on === !activeBoard.builtinLedActiveLow ? 1 : 0;
    return `machine.Pin(${pin.id}, machine.Pin.OUT).value(${level})\n`;
  };

  pythonGenerator.forBlock.hardware_sleep_ms = (block, generator) => {
    ensureImport("time");
    const ms = generator.valueToCode(block, "MS", Order.NONE) || "1000";
    return `time.sleep_ms(${ms})\n`;
  };

  pythonGenerator.forBlock.hardware_forever = (block, generator) => {
    const body = generator.statementToCode(block, "BODY");
    return `while True:\n${body || `${hardwareInternals().INDENT}pass\n`}`;
  };
}

const hardwareSectionLabel = (text: string) =>
  ({ kind: "label", text, "web-class": "python-standard-library-label" }) as unknown as Blockly.utils.toolbox.FlyoutItemInfo;

const numberShadow = (value: number) => ({ shadow: { type: "math_number", fields: { NUM: value } } });

/** 硬件分类的积木清单，引脚默认值按当前板卡选择。 */
export function hardwareToolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  const outputPin = boardPinChoices(profile, "digital-output")[0]?.id ?? "";
  const inputPin = boardPinChoices(profile, "digital-input")[0]?.id ?? "";
  const pwmPin = boardPinChoices(profile, "pwm")[0]?.id ?? "";
  const analogPin = boardPinChoices(profile, "analog")[0]?.id ?? "";
  return [
    hardwareSectionLabel(profile ? `${profile.displayName} · 设备程序` : "请先在工程中选择硬件板卡"),
    { kind: "block", type: "hardware_builtin_led", fields: { STATE: "on" } },
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("数字引脚"),
    { kind: "block", type: "hardware_pin_write", fields: { PIN: outputPin, LEVEL: "1" } },
    { kind: "block", type: "hardware_pin_read", fields: { PIN: inputPin, PULL: "none" } },
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("PWM 与模拟"),
    {
      kind: "block",
      type: "hardware_pwm_write",
      fields: { PIN: pwmPin },
      inputs: { FREQ: numberShadow(profile?.pwmFrequencyHz ?? 1000), DUTY: numberShadow(512) },
    },
    { kind: "block", type: "hardware_analog_read", fields: { PIN: analogPin } },
    { kind: "sep", gap: 20 },
    hardwareSectionLabel("时序与循环"),
    { kind: "block", type: "hardware_sleep_ms", inputs: { MS: numberShadow(1000) } },
    { kind: "block", type: "hardware_forever" },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}

export function hardwareToolboxCategory(boardId?: HardwareBoardId): Blockly.utils.toolbox.ToolboxItemInfo {
  return {
    kind: "category",
    name: hardwareToolboxCategoryName,
    colour: hardwareColours.board,
    contents: hardwareToolboxContents(boardId),
  } as unknown as Blockly.utils.toolbox.ToolboxItemInfo;
}

export type HardwareBlockIssue = { blockId?: string; message: string };

/** 检查工作区里的硬件积木是否与板卡匹配，返回带积木定位的问题列表。 */
export function collectHardwareBlockIssues(workspace: Blockly.Workspace, boardId?: HardwareBoardId): HardwareBlockIssue[] {
  const profile = getBoardProfile(boardId);
  const issues = new Map<string, HardwareBlockIssue>();
  const record = (key: string, issue: HardwareBlockIssue) => { if (!issues.has(key)) issues.set(key, issue); };
  for (const block of workspace.getAllBlocks(false)) {
    const label = hardwareBlockLabels[block.type];
    if (!label) continue;
    if (!profile) {
      record(`board-${block.id}`, { blockId: block.id, message: "硬件积木需要先在工程中选择硬件板卡" });
      continue;
    }
    const use = pinUseByBlockType[block.type];
    if (use) {
      const pinId = String(block.getFieldValue("PIN") ?? "");
      const problem = validateBoardPin(profile, use, pinId);
      if (problem) record(`pin-${block.id}`, { blockId: block.id, message: `「${label}」积木：${problem}` });
    }
    if (block.type === "hardware_builtin_led" && !builtinLedPin(profile)) {
      record(`led-${block.id}`, { blockId: block.id, message: `「${label}」积木：${profile.displayName} 没有板载 LED` });
    }
  }
  return [...issues.values()];
}
