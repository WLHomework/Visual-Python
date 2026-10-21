import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../../pythonBlocks";
import { buildProfileToolbox } from "../../profiles/profileToolbox";
import { getWorkbenchProfile } from "../../profiles/workbenchProfile";
import { setActiveHardwareBoard } from "../blocks/shared";
import { esp32S3Toolbox } from "./esp32-s3";
import { hardwareBlockEntries } from "./hardwareEntries";
import { boardToolboxSpec } from "./index";
import { resolveBoardToolbox } from "./resolve";

type ResolvedCategory = {
  kind?: string;
  name?: string;
  colour?: string | number;
  custom?: string;
  contents?: Array<Record<string, unknown>>;
};
type ResolvedDefinition = { kind?: string; contents: ResolvedCategory[] };

const expectedCategoryNames = [
  "输入/输出", "控制", "逻辑", "数学", "文本", "列表", "赋值", "变量", "函数", "调用", "串口", "传感器", "执行器", "灯光", "显示",
];

/** 第 2 节 v1 清单里明确允许出现的 python_* 积木。 */
const allowedPythonTypes = new Set([
  "python_conditional",
  "python_floor_divide",
  "python_bitwise",
  "python_bitwise_not",
  "python_convert",
  "python_text_replace",
  "python_string_method",
  "python_f_string",
  "python_sequence_collection",
  "python_list_method",
  "python_index",
  "python_list_set",
  "python_list_insert",
  "python_length",
  "python_assign_target",
  "python_augmented_assign",
  "python_function_structured",
  "python_return",
  "python_return_none",
  "python_print",
  "python_print_many",
]);

const resolveS3 = (): ResolvedDefinition =>
  resolveBoardToolbox(esp32S3Toolbox, {
    baseToolbox,
    hardwareEntries: hardwareBlockEntries("esp32-s3"),
  }) as unknown as ResolvedDefinition;

const blockTypes = (definition: ResolvedDefinition): string[] =>
  definition.contents.flatMap((category) => (category.contents ?? []).map((entry) => String(entry.type)));

afterEach(() => {
  setActiveHardwareBoard(undefined);
});

describe("esp32S3Toolbox", () => {
  it("is wired into boardToolboxSpec and keeps the section-2 category order", () => {
    expect(boardToolboxSpec("esp32-s3")).toBe(esp32S3Toolbox);
    expect(boardToolboxSpec("esp32-wroom")).toBeUndefined();
    expect(boardToolboxSpec("esp8266-esp12e")).toBeUndefined();

    const definition = resolveS3();
    expect(definition.contents.map((category) => category.name)).toEqual(expectedCategoryNames);
    // App 通过 buildProfileToolbox 拿到的就是这份解析结果。
    expect(buildProfileToolbox(baseToolbox, getWorkbenchProfile("esp32-s3"))).toEqual(definition);
  });

  it("contains no python_* block outside the v1 whitelist", () => {
    const types = blockTypes(resolveS3());

    for (const type of types.filter((value) => value.startsWith("python_"))) {
      expect(allowedPythonTypes.has(type), `不应出现的积木：${type}`).toBe(true);
    }
    for (const type of ["python_dict_get", "python_try_except", "python_lambda", "python_import", "python_slice"]) {
      expect(types).not.toContain(type);
    }
  });

  it("covers every hardware block the board provides", () => {
    const types = new Set(blockTypes(resolveS3()));

    for (const type of hardwareBlockEntries("esp32-s3").keys()) {
      expect(types.has(type), `工具箱里缺少 ${type}`).toBe(true);
    }
  });

  it("instantiates every toolbox entry in a headless workspace", () => {
    setActiveHardwareBoard("esp32-s3");
    const workspace = new Blockly.Workspace();
    try {
      for (const category of resolveS3().contents) {
        for (const entry of category.contents ?? []) {
          if (entry.kind !== "block") continue;
          const state = {
            type: String(entry.type),
            fields: entry.fields as Record<string, unknown> | undefined,
            inputs: entry.inputs as Record<string, unknown> | undefined,
            extraState: entry.extraState,
          } as unknown as Blockly.serialization.blocks.State;
          try {
            Blockly.serialization.blocks.append(state, workspace);
          } catch (error) {
            throw new Error(`积木 ${state.type} 无法实例化：${String(error)}`);
          }
        }
      }
    } finally {
      workspace.dispose();
    }
  });

  it("offers the range mapping block in the math category", () => {
    const math = resolveS3().contents.find((category) => category.name === "数学");

    expect(math?.contents?.map((entry) => entry.type)).toContain("hardware_map_range");
  });

  it("offers the timing blocks in the control category", () => {
    const control = resolveS3().contents.find((category) => category.name === "控制");

    expect(control?.contents?.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_ticks_ms", "hardware_ticks_diff", "hardware_reset", "hardware_deepsleep"]),
    );
  });

  it("offers the capacitive touch block in the input/output category", () => {
    const inputOutput = resolveS3().contents.find((category) => category.name === "输入/输出");

    expect(inputOutput?.contents?.map((entry) => entry.type)).toContain("hardware_touch_read");
  });

  it("offers the onboard RGB block in the light category", () => {
    const light = resolveS3().contents.find((category) => category.name === "灯光");

    expect(light?.contents?.map((entry) => entry.type)).toContain("hardware_onboard_rgb");
  });

  it("offers the UART blocks in the serial category", () => {
    const serial = resolveS3().contents.find((category) => category.name === "串口");

    expect(serial?.contents?.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["hardware_uart_init", "hardware_uart_write", "hardware_uart_read"]),
    );
  });

  it("offers the MCU temperature block in the sensor category", () => {
    const sensor = resolveS3().contents.find((category) => category.name === "传感器");

    expect(sensor?.contents?.map((entry) => entry.type)).toContain("hardware_mcu_temperature");
  });

  it("has unique category ids and non-empty names", () => {
    const ids = esp32S3Toolbox.categories.map((category) => category.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const category of esp32S3Toolbox.categories) {
      expect(category.id.trim()).not.toBe("");
      if ("name" in category) expect(category.name.trim()).not.toBe("");
    }
  });
});
