import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../../../pythonBlocks";
import { PluginRegistry } from "../../core/pluginRegistry";
import { numpyPlugin } from "./index";

const number = (value: number) => ({ block: { type: "math_number", fields: { NUM: value } } });
const list = (values: number[]) => ({
  block: {
    type: "python_list_collection",
    extraState: { itemCount: values.length },
    inputs: Object.fromEntries(values.map((value, index) => [`ITEM${index}`, number(value)])),
  },
});
const array = (input: object) => ({ type: "visual_python_numpy_array", inputs: { DATA: input } });
const collectToolboxBlocks = (contents: Array<Record<string, any>>): Array<Record<string, any>> =>
  contents.flatMap((item) => item.kind === "category" ? collectToolboxBlocks(item.contents ?? []) : item.kind === "block" ? [item] : []);
const findToolboxBlock = (contents: Array<Record<string, any>>, type: string): Record<string, any> | undefined =>
  collectToolboxBlocks(contents).find((item) => item.type === type);

describe("NumPy plugin", () => {
  let registry: PluginRegistry;

  const toolboxCategories = () => {
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const numpyCategory = toolbox.contents.find((entry) => entry.name === "NumPy")!;
    return numpyCategory.contents.filter((entry: Record<string, any>) => entry.kind === "category");
  };

  beforeAll(async () => {
    registry = new PluginRegistry();
    registry.register(numpyPlugin);
    await registry.activate(numpyPlugin.manifest.id);
  });

  afterAll(async () => {
    await registry.unregister(numpyPlugin.manifest.id);
  });

  it("declares NumPy as a Python dependency and publishes its Agent capability", () => {
    expect(numpyPlugin.manifest.python?.packages).toEqual(["numpy"]);
    expect(numpyPlugin.manifest.agent?.description).toContain("NumPy");
    expect(registry.getRecord(numpyPlugin.manifest.id)?.state).toBe("active");
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, unknown>> };
    expect(toolbox.contents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "NumPy" }),
    ]));
  });

  it("generates array creation and shape operations with one automatic import", () => {
    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [array(list([1, 2, 3]))] } }, workspace);
    const shape = workspace.newBlock("visual_python_numpy_shape");
    shape.getInput("ARRAY")!.connection!.connect(workspace.getTopBlocks(false).find((block) => block.type === "visual_python_numpy_array")!.outputConnection!);

    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("import numpy as np");
    expect(code).toContain("np.array([1, 2, 3])");
    expect(code).toContain(".shape");
    workspace.dispose();
  });

  it("supports custom NumPy aliases from the import block", () => {
    const workspace = new Blockly.Workspace();
    const imported = workspace.newBlock("visual_python_numpy_import");
    imported.setFieldValue("数学", "ALIAS");
    const zeros = workspace.newBlock("visual_python_numpy_zeros");
    zeros.getInput("SHAPE")!.connection!.connect(workspace.newBlock("math_number").outputConnection!);
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("import numpy as 数学");
    expect(code).toContain("数学.zeros");
    expect(code).not.toContain("import numpy as np");
    workspace.dispose();
  });

  it("keeps every registered block namespaced and generates a representative expression", () => {
    const blockTypes = registry.getBlockTypes(numpyPlugin.manifest.id);
    expect(blockTypes.length).toBeGreaterThanOrEqual(35);
    expect(blockTypes.every((type) => type.startsWith("visual_python_numpy_"))).toBe(true);
    const workspace = new Blockly.Workspace();
    const aggregate = workspace.newBlock("visual_python_numpy_aggregate");
    aggregate.setFieldValue("mean", "FUNCTION");
    aggregate.getInput("ARRAY")!.connection!.connect(workspace.newBlock("visual_python_numpy_array").outputConnection!);
    expect(pythonGenerator.forBlock.visual_python_numpy_aggregate(aggregate, pythonGenerator)).toEqual(["np.mean(np.array([]))", Order.FUNCTION_CALL]);
    workspace.dispose();
  });

  it("generates common array transformation and selection methods", () => {
    const workspace = new Blockly.Workspace();
    const flatten = workspace.newBlock("visual_python_numpy_flatten");
    flatten.getInput("ARRAY")!.connection!.connect(workspace.newBlock("visual_python_numpy_array").outputConnection!);
    const concatenate = workspace.newBlock("visual_python_numpy_concatenate");
    concatenate.setFieldValue("0", "AXIS");
    concatenate.getInput("LEFT")!.connection!.connect(workspace.newBlock("visual_python_numpy_array").outputConnection!);
    concatenate.getInput("RIGHT")!.connection!.connect(workspace.newBlock("visual_python_numpy_array").outputConnection!);
    const clip = workspace.newBlock("visual_python_numpy_clip");
    clip.getInput("ARRAY")!.connection!.connect(workspace.newBlock("visual_python_numpy_array").outputConnection!);
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain(".flatten()");
    expect(code).toContain("np.concatenate((np.array([]), np.array([])), axis=0)");
    expect(code).toContain("np.clip(np.array([]), 0, 1)");
    workspace.dispose();
  });

  it("generates common NumPy math and random methods", () => {
    const workspace = new Blockly.Workspace();
    const sqrt = workspace.newBlock("visual_python_numpy_math");
    sqrt.setFieldValue("sqrt", "FUNCTION");
    workspace.newBlock("visual_python_numpy_random_integer");
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("np.sqrt(0)");
    expect(code).toContain("np.random.randint(0, 10, size=1)");
    workspace.dispose();
  });

  it("uses editable list inputs for NumPy data and multidimensional shapes", () => {
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const numpyCategory = toolbox.contents.find((entry) => entry.name === "NumPy")!;
    const arrayEntry = findToolboxBlock(numpyCategory.contents, "visual_python_numpy_array")!;
    const reshapeEntry = findToolboxBlock(numpyCategory.contents, "visual_python_numpy_reshape")!;
    expect(arrayEntry.inputs.DATA.block.type).toBe("python_list_collection");
    expect(reshapeEntry.inputs.SHAPE.block.type).toBe("python_list_collection");

    const workspace = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: [{
      type: "visual_python_numpy_array",
      inputs: { DATA: { block: {
        type: "python_list_collection",
        extraState: { itemCount: 2 },
        inputs: {
          ITEM0: { block: { type: "python_list_collection", extraState: { itemCount: 2 }, inputs: { ITEM0: number(1), ITEM1: number(2) } } },
          ITEM1: { block: { type: "python_list_collection", extraState: { itemCount: 2 }, inputs: { ITEM0: number(3), ITEM1: number(4) } } },
        },
      } } },
    }] } }, workspace);
    expect(pythonGenerator.workspaceToCode(workspace)).toContain("np.array([[1, 2], [3, 4]])");
    workspace.dispose();
  });

  it("organizes blocks into real child categories like the Turtle plugin", () => {
    const categories = toolboxCategories();
    expect(categories.map((entry: Record<string, any>) => entry.name)).toEqual([
      "数组创建",
      "数组属性与变形",
      "计算",
      "拼接与筛选",
      "随机数",
    ]);
    expect(categories.every((entry: Record<string, any>) => entry.contents?.every((item: Record<string, any>) => item.kind === "block"))).toBe(true);
  });

  it("loads every NumPy toolbox block without shadow-child violations", () => {
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const numpyCategory = toolbox.contents.find((entry) => entry.name === "NumPy")!;
    const blocks = collectToolboxBlocks(numpyCategory.contents);
    expect(blocks).toHaveLength(registry.getBlockTypes(numpyPlugin.manifest.id).length);
    for (const entry of blocks) {
      const workspace = new Blockly.Workspace();
      const state = structuredClone(entry) as any;
      delete state.kind;
      expect(() => Blockly.serialization.blocks.append(state, workspace), entry.type).not.toThrow();
      workspace.dispose();
    }
  });

  it("generates self-contained samples for every NumPy block", () => {
    const samples = registry.generatePythonSamples(numpyPlugin.manifest.id);
    expect(samples).toHaveLength(registry.getBlockTypes(numpyPlugin.manifest.id).length);
    expect(samples.filter(({ blockType }) => blockType !== "visual_python_numpy_import").every(({ code }) => code.includes("import numpy as np"))).toBe(true);
  });
});
