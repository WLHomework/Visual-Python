import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import * as ZhHans from "blockly/msg/zh-hans";
import { pythonGenerator } from "blockly/python";
import { compileBlockPlan, type BlockPlanCompilerServices } from "../agentV2/blockPlanCompiler";
import { createBlocklyToolExecutor, type BlocklyAgentServices } from "../agentV2/blocklyHost";
import { blockTreeToPlan, parseBlockTree } from "../agentV2/blockTree";
import type { BlockTemplate } from "../agentV2/blocklyHost";
import { micropythonToWorkspace } from "./micropythonToBlocks";
import { hardwareToolboxContents, registerHardwareBlocks, setActiveHardwareBoard } from "./hardwareBlocks";
import type { HardwareBoardId } from "./firmwareCatalog";

const locale = Object.fromEntries(
  Object.entries(ZhHans).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
);
Blockly.setLocale(locale);
registerHardwareBlocks();

const templatesFor = (boardId: HardwareBoardId): Map<string, BlockTemplate> => {
  const templates = new Map<string, BlockTemplate>();
  for (const item of hardwareToolboxContents(boardId)) {
    if (!item || typeof item !== "object" || (item as { kind?: string }).kind !== "block") continue;
    const state = item as unknown as Record<string, unknown>;
    if (typeof state.type !== "string") continue;
    templates.set(state.type, {
      type: state.type,
      label: state.type,
      category: "hardware",
      state,
      inputSlots: [],
    });
  }
  return templates;
};

const compileTree = async (boardId: HardwareBoardId, tree: unknown) => {
  setActiveHardwareBoard(boardId);
  const workspace = new Blockly.Workspace();
  const templates = templatesFor(boardId);
  const services: BlockPlanCompilerServices = {
    workspace,
    getBlockTemplates: (types) => types.flatMap((type) => templates.has(type) ? [templates.get(type)!] : []),
    generateCode: (target) => pythonGenerator.workspaceToCode(target),
    validateContexts: () => [],
    validateCode: async () => undefined,
    commit: (state) => Blockly.serialization.workspaces.load(state as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace),
  };
  const result = await compileBlockPlan(blockTreeToPlan(parseBlockTree(tree)), services, new AbortController().signal);
  return { result, workspace };
};

describe("hardware block tree integration", () => {
  it.each<HardwareBoardId>(["esp32-s3", "esp32-wroom", "esp8266-esp12e"])(
    "creates a nested forever/sleep tree on %s",
    async (boardId) => {
      const { result, workspace } = await compileTree(boardId, {
        version: 1,
        mode: "replace",
        tree: {
          type: "hardware_forever",
          statements: {
            BODY: [
              { type: "hardware_pin_write", fields: { PIN: "2", LEVEL: "1" } },
              { type: "hardware_sleep_ms", values: { MS: 250 } },
            ],
          },
        },
      });

      expect(result.ok).toBe(true);
      expect(result.code).toContain("while True:");
      expect(result.code).toContain("machine.Pin(2");
      expect(result.code).toContain("time.sleep_ms(250)");
      const root = workspace.getTopBlocks(false)[0];
      expect(root?.type).toBe("hardware_forever");
      expect(root?.getInput("BODY")?.connection?.targetBlock()?.type).toBe("hardware_pin_write");
      workspace.dispose();
    },
  );

  it("converts MicroPython into hardware blocks through apply_python_as_blocks", async () => {
    setActiveHardwareBoard("esp32-wroom");
    const workspace = new Blockly.Workspace();
    const templates = templatesFor("esp32-wroom");
    const services: BlocklyAgentServices = {
      workspace,
      selectedBlockId: () => null,
      getTaskBlockDirectory: () => ({ apiVersion: 1 as const, schema: "visual-python.block-api" as const, categories: [], candidates: [] }),
      searchBlocks: () => [],
      getBlockTemplates: (types) => types.flatMap((type) => templates.has(type) ? [templates.get(type)!] : []),
      generateCode: (target) => pythonGenerator.workspaceToCode(target),
      validateContexts: () => [],
      validateCode: async () => undefined,
      convertPythonToWorkspace: (source) => micropythonToWorkspace(source, "esp32-wroom"),
      commit: (state) => Blockly.serialization.workspaces.load(state as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace),
    };
    const execute = createBlocklyToolExecutor(services);
    const result = await execute("apply_python_as_blocks", {
      version: 1,
      mode: "replace",
      code: `from machine import Pin
import time
led = Pin(2, Pin.OUT)
while True:
  led.value(1)
  time.sleep(0.25)
  led.value(0)
  time.sleep(0.25)
`,
    }, new AbortController().signal);

    expect(result).toMatchObject({ ok: true, changed: true, fallbackCount: 0 });
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("while True:");
    expect(workspace.getTopBlocks(false)[0]?.type).toBe("hardware_forever");
    workspace.dispose();
  });
});
