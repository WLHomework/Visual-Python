import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { toolbox as baseToolbox } from "../../pythonBlocks";
import { buildProfileToolbox } from "../../profiles/profileToolbox";
import { getWorkbenchProfile } from "../../profiles/workbenchProfile";
import { p0ModuleBlockTypes, p1ModuleBlockTypes, p2ModuleBlockTypes, setActiveHardwareBoard } from "../blocks/shared";
import type { HardwareBoardId } from "../firmwareCatalog";
import { esp8266Esp12eToolbox } from "./esp8266-esp12e";
import { esp32S3Toolbox } from "./esp32-s3";
import { esp32WroomToolbox } from "./esp32-wroom";
import { hardwareBlockEntries } from "./hardwareEntries";
import { boardToolboxSpec } from "./index";
import { resolveBoardToolbox } from "./resolve";
import type { BoardToolboxSpec } from "./types";

type ResolvedCategory = {
  kind?: string;
  name?: string;
  colour?: string | number;
  contents?: Array<Record<string, unknown>>;
};
type ResolvedDefinition = { kind?: string; contents: ResolvedCategory[] };

type BoardCase = {
  boardId: HardwareBoardId;
  spec: BoardToolboxSpec;
  /** 这块板卡是否提供对应外设的积木。 */
  touch: boolean;
  uart: boolean;
  mcuTemperature: boolean;
  onboardRgb: boolean;
  builtinLed: boolean;
  random: boolean;
  i2c: boolean;
  wifi: boolean;
  advancedWireless: boolean;
  storage: boolean;
  p0Modules: boolean;
  p1Modules: boolean;
  p2Modules: boolean;
  spi: boolean;
};

const boards: BoardCase[] = [
  {
    boardId: "esp32-s3",
    spec: esp32S3Toolbox,
    touch: true,
    uart: true,
    mcuTemperature: true,
    onboardRgb: true,
    builtinLed: false,
    random: true,
    i2c: true,
    wifi: true,
    advancedWireless: true,
    storage: true,
    p0Modules: true,
    p1Modules: true,
    p2Modules: true,
    spi: true,
  },
  {
    boardId: "esp32-wroom",
    spec: esp32WroomToolbox,
    touch: true,
    uart: true,
    mcuTemperature: false,
    onboardRgb: false,
    builtinLed: true,
    random: true,
    i2c: true,
    wifi: true,
    advancedWireless: false,
    storage: false,
    p0Modules: true,
    p1Modules: false,
    p2Modules: false,
    spi: false,
  },
  {
    boardId: "esp8266-esp12e",
    spec: esp8266Esp12eToolbox,
    touch: false,
    uart: false,
    mcuTemperature: false,
    onboardRgb: false,
    builtinLed: true,
    random: false,
    i2c: true,
    wifi: true,
    advancedWireless: false,
    storage: false,
    p0Modules: true,
    p1Modules: false,
    p2Modules: false,
    spi: false,
  },
];

const expectedCategoryNames = (storage: boolean) => [
  "输入/输出", "控制", "逻辑", "数学", "文本", "列表", "元组", "字典", "集合", "赋值", "变量", "函数", "调用", "串口", "通信", "网络",
  ...(storage ? ["存储"] : []),
  "传感器", "执行器", "灯光", "显示",
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
  "python_builtin_zip",
  "python_slice_basic",
  "python_membership",
  "python_sequence_query",
  "python_sequence_combine",
  "python_tuple_unpack",
  "python_for_in",
  "python_for_enumerate",
  "python_dynamic_dict",
  "python_dict_from_pairs",
  "python_dict_fromkeys",
  "python_dict_query",
  "python_dict_get",
  "python_dict_item",
  "python_dict_view",
  "python_dict_view_list",
  "python_dict_set",
  "python_dict_remove",
  "python_dict_method",
  "python_dict_merge",
  "python_for_dict",
  "python_dict_comprehension",
  "python_set_copy",
  "python_set_method",
  "python_set_operation",
  "python_set_relation",
  "python_set_comprehension",
  "python_assign_target",
  "python_augmented_assign",
  "python_function_structured",
  "python_return",
  "python_return_none",
  "python_print",
  "python_print_many",
]);

const resolveBoard = (boardId: HardwareBoardId): ResolvedDefinition =>
  resolveBoardToolbox(boardToolboxSpec(boardId) as BoardToolboxSpec, {
    baseToolbox,
    hardwareEntries: hardwareBlockEntries(boardId),
  }) as unknown as ResolvedDefinition;

const blockTypes = (definition: ResolvedDefinition): string[] =>
  definition.contents.flatMap((category) => (category.contents ?? []).map((entry) => String(entry.type)));

afterEach(() => {
  setActiveHardwareBoard(undefined);
});

describe("板卡工具箱声明", () => {
  it("每块板卡都有自己的声明", () => {
    for (const board of boards) {
      expect(boardToolboxSpec(board.boardId), `${board.boardId} 没有声明`).toBe(board.spec);
    }
  });
});

for (const board of boards) {
  describe(`${board.boardId} 工具箱`, () => {
    it("wires the declaration into buildProfileToolbox with the section-2 category order", () => {
      const definition = resolveBoard(board.boardId);

      expect(definition.contents.map((category) => category.name)).toEqual(expectedCategoryNames(board.storage));
      // App 通过 buildProfileToolbox 拿到的就是这份解析结果。
      expect(buildProfileToolbox(baseToolbox, getWorkbenchProfile(board.boardId))).toEqual(definition);
    });

    it("contains no python_* block outside the v1 whitelist", () => {
      const types = blockTypes(resolveBoard(board.boardId));

      for (const type of types.filter((value) => value.startsWith("python_"))) {
        expect(allowedPythonTypes.has(type), `不应出现的积木：${type}`).toBe(true);
      }
      for (const type of ["python_try_except", "python_lambda", "python_import"]) {
        expect(types).not.toContain(type);
      }
      expect(types).toContain("python_dict_get");
      expect(types).toContain("python_slice_basic");
    });

    it("offers tuple, dictionary and set categories", () => {
      const definition = resolveBoard(board.boardId);
      const names = definition.contents.map((category) => category.name);
      for (const name of ["列表", "元组", "字典", "集合"]) {
        expect(names).toContain(name);
      }
      const types = new Set(blockTypes(definition));
      expect(types.has("python_dict_view_list")).toBe(true);
      expect(types.has("python_for_dict")).toBe(true);
      expect(types.has("python_set_method")).toBe(true);
      expect(types.has("python_dict_merge")).toBe(false);
    });

    it("uses the category colour for every container block", () => {
      setActiveHardwareBoard(board.boardId);
      const workspace = new Blockly.Workspace();
      try {
        const definition = resolveBoard(board.boardId);
        for (const name of ["列表", "元组", "字典", "集合"]) {
          const category = definition.contents.find((entry) => entry.name === name)!;
          const colour = String(category.colour).toLowerCase();
          for (const entry of category.contents ?? []) {
            if (entry.kind !== "block") continue;
            const block = Blockly.serialization.blocks.append({
              type: String(entry.type),
              fields: entry.fields as Record<string, unknown> | undefined,
              inputs: entry.inputs as Record<string, unknown> | undefined,
              extraState: entry.extraState,
            } as unknown as Blockly.serialization.blocks.State, workspace);
            try {
              expect(block.getColour().toLowerCase(), `${name}/${String(entry.type)}`).toBe(colour);
            } finally {
              block.dispose(false);
            }
          }
        }
      } finally {
        workspace.dispose();
        setActiveHardwareBoard(undefined);
      }
    });

    it("covers every hardware block the board provides", () => {
      const types = new Set(blockTypes(resolveBoard(board.boardId)));

      for (const type of hardwareBlockEntries(board.boardId).keys()) {
        expect(types.has(type), `工具箱里缺少 ${type}`).toBe(true);
      }
    });

    it("only offers the peripheral blocks the board has", () => {
      const types = new Set(blockTypes(resolveBoard(board.boardId)));

      expect(types.has("hardware_touch_read")).toBe(board.touch);
      expect(types.has("hardware_uart_init")).toBe(board.uart);
      expect(types.has("hardware_uart_available")).toBe(board.uart);
      expect(types.has("hardware_uart_deinit")).toBe(board.uart);
      expect(types.has("hardware_mcu_temperature")).toBe(board.mcuTemperature);
      expect(types.has("hardware_onboard_rgb")).toBe(board.onboardRgb);
      expect(types.has("hardware_builtin_led")).toBe(board.builtinLed);
      expect(types.has("math_random_int")).toBe(board.random);
      expect(types.has("math_random_float")).toBe(board.random);
      expect(types.has("hardware_i2c_init")).toBe(board.i2c);
      expect(types.has("hardware_wifi_connect")).toBe(board.wifi);
      expect(types.has("hardware_wifi_ap_start")).toBe(board.advancedWireless);
      expect(types.has("hardware_wifi_ap_ip")).toBe(board.advancedWireless);
      expect(types.has("hardware_wifi_rssi")).toBe(board.advancedWireless);
      expect(types.has("hardware_http_get")).toBe(board.advancedWireless);
      expect(types.has("hardware_http_post")).toBe(board.advancedWireless);
      expect(types.has("hardware_ntp_sync")).toBe(board.advancedWireless);
      expect(types.has("hardware_ntp_local")).toBe(board.advancedWireless);
      expect(types.has("hardware_ble_start")).toBe(board.advancedWireless);
      expect(types.has("hardware_espnow_init")).toBe(board.advancedWireless);
      expect(types.has("hardware_mqtt_connect")).toBe(board.advancedWireless);
      expect(types.has("hardware_mqtt_disconnect")).toBe(board.advancedWireless);
      expect(types.has("hardware_file_write")).toBe(board.storage);
      expect(types.has("hardware_file_append")).toBe(board.storage);
      expect(types.has("hardware_file_list")).toBe(board.storage);
      expect(types.has("hardware_nvs_set")).toBe(board.storage);
      expect(types.has("hardware_nvs_delete")).toBe(board.storage);
      expect(types.has("hardware_i2c_deinit")).toBe(board.i2c);
      expect(types.has("hardware_spi_init")).toBe(board.spi);
      expect(types.has("hardware_spi_transfer")).toBe(board.spi);
      for (const type of p0ModuleBlockTypes) {
        expect(types.has(type), `${board.boardId} 的 ${type}`).toBe(board.p0Modules);
      }
      for (const type of p1ModuleBlockTypes) {
        expect(types.has(type), `${board.boardId} 的 ${type}`).toBe(board.p1Modules);
      }
      for (const type of p2ModuleBlockTypes) {
        expect(types.has(type), `${board.boardId} 的 ${type}`).toBe(board.p2Modules);
      }
    });

    it("instantiates every toolbox entry in a headless workspace", () => {
      setActiveHardwareBoard(board.boardId);
      const workspace = new Blockly.Workspace();
      try {
        for (const category of resolveBoard(board.boardId).contents) {
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

    it("has unique category ids and non-empty names", () => {
      const ids = board.spec.categories.map((category) => category.id);

      expect(new Set(ids).size).toBe(ids.length);
      for (const category of board.spec.categories) {
        expect(category.id.trim()).not.toBe("");
        if ("name" in category) expect(category.name.trim()).not.toBe("");
      }
    });
  });
}
