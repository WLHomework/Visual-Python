import * as Blockly from "blockly/core";
import { getBoardProfile } from "../boardProfiles";
import type { HardwareBoardId } from "../firmwareCatalog";
import {
  defineHardwareBlocks,
  ensureImport,
  getActiveHardwareBoard,
  hardwareColours,
  hardwareGenerator,
  hardwareSectionLabel,
  numberShadow,
  numericInputValue,
  pythonOrder,
  unavailable,
} from "./shared";

const definitions = [
  {
    type: "hardware_timer_every",
    message0: "定时器：每 %1 毫秒执行",
    args0: [{ type: "input_value", name: "PERIOD", check: "Number" }],
    message1: "%1",
    args1: [{ type: "input_statement", name: "BODY" }],
    colour: hardwareColours.loop,
    tooltip:
      "创建一个周期性硬件定时器，在后台按固定间隔执行内部积木。最多同时使用 4 个；回调运行在中断上下文，只放简单的引脚/变量操作，不要放延时、串口打印、Wi-Fi 或长时间循环。请放在程序顶层，避免在循环里重复创建。",
    previousStatement: null,
    nextStatement: null,
  },
];

const timerPeriodProblem = (value: number | undefined): string | undefined =>
  value === undefined || (Number.isInteger(value) && value >= 1 && value <= 3600000)
    ? undefined
    : "定时器周期必须是 1–3600000 之间的整数毫秒";

export function register(): void {
  defineHardwareBlocks(definitions);

  hardwareGenerator.forBlock.hardware_timer_every = (block, generator) => {
    const profile = getActiveHardwareBoard();
    if (!profile) return unavailable("请先选择硬件板卡");
    const problem = timerPeriodProblem(numericInputValue(block, "PERIOD"));
    if (problem) return unavailable(problem);
    ensureImport("machine");
    // 定时器编号按画布中的出现顺序分配，保证同一份生成代码稳定；超过 4 个由问题面板提示。
    const timers = block.workspace.getAllBlocks(false).filter((item) => item.type === "hardware_timer_every");
    const index = Math.max(0, timers.findIndex((item) => item.id === block.id));
    const timerId = index % 4;
    const suffix = `${timerId}_${block.id.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const callback = `hardware_timer_cb_${suffix}`;
    const timerVar = `hardware_timer_${suffix}`;
    const body = generator.statementToCode(block, "BODY") || `${generator.INDENT}pass\n`;
    const period = generator.valueToCode(block, "PERIOD", pythonOrder.NONE) || "500";
    return [
      `def ${callback}(_timer):`,
      body.trimEnd(),
      `if globals().get("${timerVar}") is None:`,
      `${generator.INDENT}${timerVar} = machine.Timer(${timerId})`,
      `${generator.INDENT}${timerVar}.init(period=int(${period}), mode=machine.Timer.PERIODIC, callback=${callback})`,
      `${generator.INDENT}globals()["${timerVar}"] = ${timerVar}`,
      "",
    ].join("\n");
  };
}

export function toolboxContents(boardId?: HardwareBoardId): Blockly.utils.toolbox.FlyoutItemInfo[] {
  const profile = getBoardProfile(boardId);
  if (!profile?.p2Modules) return [];
  return [
    hardwareSectionLabel("定时器"),
    {
      kind: "block",
      type: "hardware_timer_every",
      inputs: { PERIOD: numberShadow(500) },
    },
  ] as unknown as Blockly.utils.toolbox.FlyoutItemInfo[];
}
