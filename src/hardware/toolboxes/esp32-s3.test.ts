import { afterEach, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { generateWorkspacePython, toolbox as baseToolbox } from "../../pythonBlocks";
import { buildProfileToolbox } from "../../profiles/profileToolbox";
import { getWorkbenchProfile } from "../../profiles/workbenchProfile";
import { collectHardwareBlockIssues } from "../hardwareBlocks";
import { setActiveHardwareBoard } from "../blocks/shared";
import { esp32S3Toolbox } from "./esp32-s3";
import { hardwareBlockEntries } from "./hardwareEntries";
import { boardToolboxSpec } from "./index";
import { resolveBoardToolbox } from "./resolve";

type ResolvedCategory = {
  kind?: string;
  name?: string;
  colour?: string | number;
  categorystyle?: string;
  custom?: string;
  contents?: Array<Record<string, unknown>>;
};
type ResolvedDefinition = { kind?: string; contents: ResolvedCategory[] };

const expectedCategoryNames = [
  "输入/输出", "控制", "逻辑", "数学", "文本", "列表", "赋值", "变量", "函数", "调用", "串口", "通信", "网络", "存储", "传感器", "执行器", "灯光", "显示",
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

  it("still loads and generates blocks that are not in the toolbox", () => {
    const workspace = new Blockly.Workspace();
    try {
      // 工具箱只决定"能拖出什么"：旧工程里已经在用的积木必须照常生成，也不能被当成问题。
      const tryBlock = workspace.newBlock("python_try_except");
      const assignment = workspace.newBlock("python_assign_target");
      const dict = workspace.newBlock("python_dict_get");
      const tryInput = tryBlock.getInput("TRY")?.connection;
      const targetConnection = assignment.previousConnection;
      const valueInput = assignment.getInput("VALUE")?.connection;
      const dictOutput = dict.outputConnection;
      if (!tryInput || !targetConnection || !valueInput || !dictOutput) throw new Error("测试积木缺少连接点");
      tryInput.connect(targetConnection);
      valueInput.connect(dictOutput);

      const code = generateWorkspacePython(workspace);

      expect(code).toContain("try:");
      expect(code).toContain(".get(");
      expect(collectHardwareBlockIssues(workspace, "esp32-s3")).toEqual([]);
    } finally {
      workspace.dispose();
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

  it("keeps every block in a category on the same colour", () => {
    setActiveHardwareBoard("esp32-s3");
    const workspace = new Blockly.Workspace();
    try {
      for (const category of resolveS3().contents) {
        const typesByColour = new Map<string, string[]>();
        for (const entry of category.contents ?? []) {
          if (entry.kind !== "block") continue;
          const block = workspace.newBlock(String(entry.type));
          try {
            const colour = block.getColour();
            // 只写 style 的积木（controls_if、math_number 等）在没有主题的无头工作区里取不到颜色。
            if (colour === "#000000") continue;
            const key = colour.toLowerCase();
            typesByColour.set(key, [...(typesByColour.get(key) ?? []), String(entry.type)]);
          } finally {
            block.dispose(false);
          }
        }
        const summary = [...typesByColour].map(([colour, types]) => `${colour}：${types.join("、")}`).join("；");
        expect(typesByColour.size, `分类「${String(category.name)}」里的积木颜色不一致：${summary}`).toBeLessThanOrEqual(1);
      }
    } finally {
      workspace.dispose();
      setActiveHardwareBoard(undefined);
    }
  });

  it("gives every category a different colour", () => {
    const classicStyles =
      (Blockly.Themes.Classic as unknown as { categoryStyles: Record<string, { colour?: string | number }> }).categoryStyles;
    const hueToHex = (Blockly.utils.colour as unknown as { hueToHex(hue: number): string }).hueToHex;
    const colourOf = (category: ResolvedCategory): string => {
      const raw =
        typeof category.colour === "string" && category.colour
          ? category.colour
          : // 动态分类（变量）沿用基础工具箱的 categorystyle，颜色要到 Classic 主题里查。
            category.categorystyle
            ? String(classicStyles[category.categorystyle]?.colour ?? "")
            : "";
      if (!raw) return "";
      // 色条写的是色相（如 "210"）还是十六进制都按最终颜色比较。
      return (/^#/.test(raw) ? raw : hueToHex(Number(raw))).toLowerCase();
    };
    const categories = resolveS3().contents;
    const seen = new Map<string, string>();

    for (const category of categories) {
      const name = String(category.name);
      const colour = colourOf(category);
      expect(colour, `分类「${name}」没有颜色`).not.toBe("");
      expect(seen.get(colour), `「${seen.get(colour)}」与「${name}」用了同一个颜色`).toBeUndefined();
      seen.set(colour, name);
    }

    expect(seen.size).toBe(categories.length);
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

  it("offers the H1 button, PIR, analog sensors, relay, motor and NeoPixel fill blocks", () => {
    const categories = resolveS3().contents;
    const typesIn = (name: string) => categories.find((category) => category.name === name)?.contents?.map((entry) => String(entry.type)) ?? [];

    expect(typesIn("输入/输出")).toContain("hardware_button_read");
    expect(typesIn("传感器")).toEqual(expect.arrayContaining(["hardware_pir_motion", "hardware_light_percent", "hardware_soil_percent"]));
    expect(typesIn("执行器")).toEqual(expect.arrayContaining(["hardware_relay_set", "hardware_dc_motor", "hardware_tone"]));
    const light = typesIn("灯光");
    expect(light).toContain("hardware_neopixel_fill");
    expect(light.indexOf("hardware_neopixel_fill")).toBeLessThan(light.indexOf("hardware_neopixel_write"));
  });

  it("offers the H2 LCD1602 and BH1750 blocks", () => {
    const categories = resolveS3().contents;
    const typesIn = (name: string) => categories.find((category) => category.name === name)?.contents?.map((entry) => String(entry.type)) ?? [];

    expect(typesIn("显示")).toEqual(expect.arrayContaining(["hardware_lcd1602_init", "hardware_lcd1602_text", "hardware_lcd1602_clear"]));
    expect(typesIn("传感器")).toContain("hardware_bh1750_lux");
  });

  it("offers the onboard RGB block in the light category", () => {
    const light = resolveS3().contents.find((category) => category.name === "灯光");

    expect(light?.contents?.map((entry) => entry.type)).toContain("hardware_onboard_rgb");
  });

  it("offers the UART blocks in the serial category", () => {
    const serial = resolveS3().contents.find((category) => category.name === "串口");

    expect(serial?.contents?.map((entry) => entry.type)).toEqual(
      expect.arrayContaining([
        "hardware_uart_init",
        "hardware_uart_write",
        "hardware_uart_read",
        "hardware_uart_available",
        "hardware_uart_deinit",
      ]),
    );
  });

  it("offers the I2C, BLE and ESP-NOW blocks in the communication category", () => {
    const communication = resolveS3().contents.find((category) => category.name === "通信");

    expect(communication?.contents?.map((entry) => entry.type)).toEqual([
      "hardware_i2c_init",
      "hardware_i2c_scan",
      "hardware_i2c_write_register",
      "hardware_i2c_read_register",
      "hardware_i2c_deinit",
      "hardware_spi_init",
      "hardware_spi_transfer",
      "hardware_spi_transfer_text",
      "hardware_ble_start",
      "hardware_ble_stop",
      "hardware_espnow_init",
      "hardware_espnow_mac",
      "hardware_espnow_send",
      "hardware_espnow_receive",
      "hardware_espnow_last_mac",
    ]);
  });

  it("offers the Wi-Fi, HTTP, NTP and MQTT blocks in the network category", () => {
    const network = resolveS3().contents.find((category) => category.name === "网络");

    expect(network?.contents?.map((entry) => entry.type)).toEqual([
      "hardware_wifi_connect",
      "hardware_wifi_wait",
      "hardware_wifi_connected",
      "hardware_wifi_ip",
      "hardware_wifi_disconnect",
      "hardware_wifi_ap_start",
      "hardware_wifi_ap_stop",
      "hardware_wifi_ap_ip",
      "hardware_wifi_rssi",
      "hardware_http_get",
      "hardware_http_post",
      "hardware_ntp_sync",
      "hardware_ntp_now",
      "hardware_ntp_local",
      "hardware_mqtt_connect",
      "hardware_mqtt_publish",
      "hardware_mqtt_subscribe",
      "hardware_mqtt_wait",
      "hardware_mqtt_last_topic",
      "hardware_mqtt_disconnect",
    ]);
  });

  it("offers text files and NVS in the storage category", () => {
    const storage = resolveS3().contents.find((category) => category.name === "存储");

    expect(storage?.contents?.map((entry) => entry.type)).toEqual([
      "hardware_file_write",
      "hardware_file_append",
      "hardware_file_read",
      "hardware_file_exists",
      "hardware_file_delete",
      "hardware_file_list",
      "hardware_nvs_set",
      "hardware_nvs_get",
      "hardware_nvs_delete",
    ]);
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
