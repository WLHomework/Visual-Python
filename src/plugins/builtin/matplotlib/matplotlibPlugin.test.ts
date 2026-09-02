import * as Blockly from "blockly/core";
import { pythonGenerator } from "blockly/python";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../../../pythonBlocks";
import { getFileBlockPickerConfigs } from "../../../fileBlockPicker";
import { PluginRegistry } from "../../core/pluginRegistry";
import { matplotlibPlugin } from "./index";

const collectToolboxBlocks = (contents: Array<Record<string, any>>): Array<Record<string, any>> =>
  contents.flatMap((item) => item.kind === "category" ? collectToolboxBlocks(item.contents ?? []) : item.kind === "block" ? [item] : []);

describe("Matplotlib plugin", () => {
  let registry: PluginRegistry;

  beforeAll(async () => {
    registry = new PluginRegistry();
    registry.register(matplotlibPlugin);
    await registry.activate(matplotlibPlugin.manifest.id);
  });

  afterAll(async () => {
    await registry.unregister(matplotlibPlugin.manifest.id);
  });

  it("declares Matplotlib as a dependency and exposes categorized blocks", () => {
    expect(matplotlibPlugin.manifest.python?.packages).toEqual(["matplotlib"]);
    expect(matplotlibPlugin.manifest.agent?.description).toContain("Matplotlib");
    expect(registry.getRecord(matplotlibPlugin.manifest.id)?.state).toBe("active");
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const root = toolbox.contents.find((entry) => entry.name === "Matplotlib")!;
    expect(root.contents.every((item: Record<string, any>) => item.kind === "category")).toBe(true);
    expect(root.contents.map((item: Record<string, any>) => item.name)).toEqual([
      "导入与画布", "基础绘图", "图形配置", "坐标轴", "曲线样式", "多图布局", "输出与保存",
    ]);
  });

  it("generates plotting code with one automatic pyplot import", () => {
    const workspace = new Blockly.Workspace();
    workspace.newBlock("visual_python_matplotlib_plot");
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("import matplotlib.pyplot as plt");
    expect(code).toContain("plt.plot([1, 2, 3], [1, 4, 9])");
    workspace.dispose();
  });

  it("supports a custom pyplot alias from the import block", () => {
    const workspace = new Blockly.Workspace();
    const imported = workspace.newBlock("visual_python_matplotlib_import");
    imported.setFieldValue("绘图", "ALIAS");
    workspace.newBlock("visual_python_matplotlib_scatter");
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("import matplotlib.pyplot as 绘图");
    expect(code).toContain("绘图.scatter");
    expect(code).not.toContain("import matplotlib.pyplot as plt");
    workspace.dispose();
  });

  it("uses the shared save-file picker and generates output commands", () => {
    expect(getFileBlockPickerConfigs("visual_python_matplotlib_savefig")[0]).toMatchObject({ inputName: "PATH", mode: "save-file" });
    const workspace = new Blockly.Workspace();
    const save = workspace.newBlock("visual_python_matplotlib_savefig");
    expect(save.getField("FILE_PICKER_PATH")).not.toBeNull();
    workspace.newBlock("visual_python_matplotlib_show");
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("plt.savefig('图形.png'");
    expect(code).toContain("plt.show()");
    workspace.dispose();
  });

  it("loads every registered block and generates a sample", () => {
    const blockTypes = registry.getBlockTypes(matplotlibPlugin.manifest.id);
    expect(blockTypes.length).toBe(29);
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const root = toolbox.contents.find((entry) => entry.name === "Matplotlib")!;
    const blocks = collectToolboxBlocks(root.contents);
    expect(blocks).toHaveLength(blockTypes.length);
    for (const entry of blocks) {
      const workspace = new Blockly.Workspace();
      const state = structuredClone(entry) as any;
      delete state.kind;
      expect(() => Blockly.serialization.blocks.append(state, workspace), entry.type).not.toThrow();
      workspace.dispose();
    }
    expect(registry.generatePythonSamples(matplotlibPlugin.manifest.id)).toHaveLength(blockTypes.length);
  });
});
