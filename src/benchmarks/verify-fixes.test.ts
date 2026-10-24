/**
 * 修复验证（无头）：复现基准跑批暴露的三个失败场景，验证修复后的完整链路。
 * 不访问网络；与 ai-block-benchmark.test.ts 共用 vitest.bench.config.ts 环境。
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import "blockly/blocks";
import { generateWorkspacePython } from "../pythonBlocks";
import { validatePythonBlockContexts } from "../pythonSyntaxBlocks";
import { createBlocklyToolExecutor } from "../agentV2/blocklyHost";
import { manimPythonToWorkspace } from "../manimPythonToBlocks";
import { micropythonToWorkspace } from "../hardware/micropythonToBlocks";
import { collectHardwareBlockIssues, registerHardwareBlocks } from "../hardware/hardwareBlocks";
import { setActiveHardwareBoard } from "../hardware/blocks/shared";
import { initializePlugins } from "../plugins";
import type { BlocklyAgentServices } from "../agentV2/blocklyHost";

const signal = () => new AbortController().signal;

beforeAll(async () => {
  registerHardwareBlocks();
  await initializePlugins();
}, 120_000);

// 从 Blockly 注册表动态生成模板，模拟真实工作台的 getBlockTemplates。
const templateScratch = new Blockly.Workspace();
const getBlockTemplates = (types: string[]) => types.flatMap((type) => {
  let block: Blockly.Block | null = null;
  try {
    block = templateScratch.newBlock(type);
  } catch {
    return [];
  }
  if (!block) return [];
  const state = Blockly.serialization.blocks.save(block);
  block.dispose(false);
  return [{ type, label: type, category: "Verify", state, inputSlots: [] }];
});

const services = (workspace: Blockly.Workspace, convert: (code: string) => object, validate: (ws: Blockly.Workspace) => { message: string }[]): BlocklyAgentServices => ({
  workspace,
  selectedBlockId: () => null,
  getTaskBlockDirectory: () => ({ blocks: [] }),
  searchBlocks: () => [],
  getBlockTemplates,
  generateCode: (ws: Blockly.Workspace) => generateWorkspacePython(ws),
  validateContexts: validate,
  validateCode: async () => undefined,
  convertPythonToWorkspace: convert,
  commit: (state: object) => {
    Blockly.serialization.workspaces.load(state as Parameters<typeof Blockly.serialization.workspaces.load>[0], workspace);
  },
  entryBlockTypes: [],
});

describe("基准失败场景的端到端修复验证", () => {
  it("M4：Rectangle + Create + animate().scale() 走 apply_python_as_blocks 完整通过", async () => {
    const workspace = new Blockly.Workspace();
    const execute = createBlocklyToolExecutor(services(
      workspace,
      (code) => manimPythonToWorkspace(code),
      (ws) => validatePythonBlockContexts(ws),
    ));
    const result = await execute("apply_python_as_blocks", {
      version: "1",
      mode: "replace",
      code: `from manim import *


class RectScene(Scene):
    def construct(self):
        obj = Rectangle(width=3, height=2, color=ORANGE)
        self.play(Create(obj))
        self.play(obj.animate(run_time=1).scale(0.5))
        self.wait(2)
`,
    }, signal());
    expect(result).toMatchObject({ ok: true, changed: true });
    expect((result as { fallbackCount?: number }).fallbackCount ?? 0).toBe(0);
    const code = generateWorkspacePython(workspace);
    expect(code).toMatch(/Rectangle/);
    expect(code).toMatch(/Create\(/);
    expect(code).toMatch(/scale\(/);
    expect(validatePythonBlockContexts(workspace)).toHaveLength(0);
    workspace.dispose();
  });

  it("S5：NeoPixel(Pin(4, Pin.OUT)) 能被识别并转换", async () => {
    const workspace = new Blockly.Workspace();
    setActiveHardwareBoard("esp32-s3");
    const execute = createBlocklyToolExecutor(services(
      workspace,
      (code) => micropythonToWorkspace(code, "esp32-s3"),
      (ws) => collectHardwareBlockIssues(ws, "esp32-s3"),
    ));
    const result = await execute("apply_python_as_blocks", {
      version: 1,
      mode: "replace",
      code: `import neopixel
from machine import Pin

np = neopixel.NeoPixel(Pin(4, Pin.OUT), 8)
while True:
    np[0] = (255, 0, 0)
    np[7] = (0, 0, 255)
    np.write()
`,
    }, signal());
    expect(result).toMatchObject({ ok: true, changed: true });
    const code = generateWorkspacePython(workspace);
    expect(code).toMatch(/NeoPixel/);
    expect(collectHardwareBlockIssues(workspace, "esp32-s3")).toHaveLength(0);
    workspace.dispose();
  });

  it("S3：PWM 可变占空比转换器明确报错；双重编码的积木树兜底成功（修复前 100% 失败）", async () => {
    const workspace = new Blockly.Workspace();
    setActiveHardwareBoard("esp32-s3");
    const execute = createBlocklyToolExecutor(services(
      workspace,
      (code) => micropythonToWorkspace(code, "esp32-s3"),
      (ws) => collectHardwareBlockIssues(ws, "esp32-s3"),
    ));
    const codeFirst = await execute("apply_python_as_blocks", {
      version: 1,
      mode: "replace",
      code: `from machine import Pin, PWM
import time

pwm = PWM(Pin(2), freq=1000)
for i in range(0, 256, 8):
    pwm.duty(i)
    time.sleep_ms(10)
`,
    }, signal());
    expect((codeFirst as { ok?: boolean }).ok).toBe(false);
    expect(JSON.stringify(codeFirst)).toContain("占空比");

    // qwen 实测会把嵌套 tree 参数整体字符串化（双重 JSON 编码）——修复后应能解码并成功提交。
    const tree = {
      type: "controls_repeat_ext",
      values: { TIMES: 32 },
      statements: { DO: [{ type: "hardware_pwm_write", fields: { PIN: "2" }, values: { FREQ: 1000, DUTY: 128 } }] },
    };
    const treeResult = await execute("apply_block_program", {
      version: "1",
      mode: "replace",
      tree: JSON.stringify(tree),
    }, signal());
    if (!(treeResult as { ok?: boolean }).ok) console.log("tree result:", JSON.stringify(treeResult).slice(0, 600));
    expect(treeResult).toMatchObject({ ok: true, changed: true });
    expect(workspace.getAllBlocks(false).length).toBeGreaterThan(0);
    expect(generateWorkspacePython(workspace)).toMatch(/hardware_set_pwm|PWM/);
    workspace.dispose();
  });
});
