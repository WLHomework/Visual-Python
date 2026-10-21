import { describe, expect, it, vi } from "vitest";
import { toolbox as pythonToolbox } from "../pythonBlocks";
import { buildProfileToolbox } from "./profileToolbox";
import { getWorkbenchProfile } from "./workbenchProfile";

// 用测试替身注入一份假声明，只验证 buildProfileToolbox 对声明的接线。
const { fakeSpec } = vi.hoisted(() => ({
  fakeSpec: {
    boardId: "esp32-s3",
    categories: [
      { id: "logic", name: "逻辑", colour: "#111111", items: ["controls_if"] },
      { id: "variables", fromBase: "变量" },
    ],
  },
}));

vi.mock("../hardware/toolboxes", () => ({
  boardToolboxSpec: (boardId: string) => (boardId === "esp32-s3" ? fakeSpec : undefined),
  hardwareBlockEntries: () => new Map(),
}));

type ResolvedDefinition = { kind: string; contents: Array<{ kind?: string; name?: string }> };

describe("buildProfileToolbox with a board toolbox spec", () => {
  it("returns the resolved spec and ignores the passed toolbox", () => {
    const definition = buildProfileToolbox(pythonToolbox, getWorkbenchProfile("esp32-s3")) as unknown as ResolvedDefinition;

    expect(definition.kind).toBe("categoryToolbox");
    expect(definition.contents.map((category) => category.name)).toEqual(["逻辑", "变量"]);
    // 传入的 Python 工具箱被忽略：它的分类（以及插件扩展出来的分类）不会漏进硬件界面。
    expect(definition.contents.some((category) => category.name === "输入输出")).toBe(false);
  });

  it("throws for boards without a spec instead of falling back to the passed toolbox", () => {
    expect(() => buildProfileToolbox(pythonToolbox, getWorkbenchProfile("esp32-wroom"))).toThrow(/缺少专属工具箱声明/);
  });
});
