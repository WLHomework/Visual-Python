import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import "../../../pythonBlocks";
import { getFileBlockPickerConfigs } from "../../../fileBlockPicker";
import { PluginRegistry } from "../../core/pluginRegistry";
import { pandasPlugin } from "./index";

const collectToolboxBlocks = (contents: Array<Record<string, any>>): Array<Record<string, any>> =>
  contents.flatMap((item) => item.kind === "category" ? collectToolboxBlocks(item.contents ?? []) : item.kind === "block" ? [item] : []);

describe("Pandas plugin", () => {
  let registry: PluginRegistry;

  beforeAll(async () => {
    registry = new PluginRegistry();
    registry.register(pandasPlugin);
    await registry.activate(pandasPlugin.manifest.id);
  });

  afterAll(async () => {
    await registry.unregister(pandasPlugin.manifest.id);
  });

  it("declares Pandas as a Python dependency and publishes its Agent capability", () => {
    expect(pandasPlugin.manifest.python?.packages).toEqual(["pandas", "openpyxl", "xlrd"]);
    expect(pandasPlugin.manifest.agent?.description).toContain("Pandas");
    expect(registry.getRecord(pandasPlugin.manifest.id)?.state).toBe("active");
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, unknown>> };
    expect(toolbox.contents).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Pandas" }),
    ]));
  });

  it("adds shared file pickers to CSV and Excel inputs", () => {
    expect(getFileBlockPickerConfigs("visual_python_pandas_read_csv")[0]).toMatchObject({ inputName: "PATH", mode: "open-file" });
    expect(getFileBlockPickerConfigs("visual_python_pandas_to_csv")[0]).toMatchObject({ inputName: "PATH", mode: "save-file" });
    expect(getFileBlockPickerConfigs("visual_python_pandas_read_excel")[0]).toMatchObject({ inputName: "PATH", mode: "open-file" });
    expect(getFileBlockPickerConfigs("visual_python_pandas_to_excel")[0]).toMatchObject({ inputName: "PATH", mode: "save-file" });
    const workspace = new Blockly.Workspace();
    expect(workspace.newBlock("visual_python_pandas_read_csv").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("visual_python_pandas_to_csv").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("visual_python_pandas_read_excel").getField("FILE_PICKER_PATH")).not.toBeNull();
    expect(workspace.newBlock("visual_python_pandas_to_excel").getField("FILE_PICKER_PATH")).not.toBeNull();
    workspace.dispose();
  });

  it("generates DataFrame creation and common analysis operations with one automatic import", () => {
    const workspace = new Blockly.Workspace();
    const frame = workspace.newBlock("visual_python_pandas_dataframe");
    frame.getInput("DATA")!.connection!.connect(workspace.newBlock("python_raw_expression").outputConnection!);
    frame.getInputTargetBlock("DATA")!.setFieldValue("数据", "CODE");
    const column = workspace.newBlock("visual_python_pandas_get_column");
    column.getInput("DATAFRAME")!.connection!.connect(frame.outputConnection!);
    column.getInput("COLUMN")!.connection!.connect(workspace.newBlock("text").outputConnection!);
    column.getInputTargetBlock("COLUMN")!.setFieldValue("分数", "TEXT");
    const filtered = workspace.newBlock("visual_python_pandas_filter");
    filtered.getInput("DATAFRAME")!.connection!.connect(workspace.newBlock("visual_python_pandas_dataframe").outputConnection!);
    filtered.getInput("CONDITION")!.connection!.connect(workspace.newBlock("python_raw_expression").outputConnection!);
    filtered.getInputTargetBlock("CONDITION")!.setFieldValue("数据['分数'] >= 60", "CODE");

    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("import pandas as pd");
    expect(code).toContain("pd.DataFrame(数据)");
    expect(code).toContain("['分数']");
    expect(code).toContain("['分数'] >= 60");
    workspace.dispose();
  });

  it("supports a custom Pandas alias from the import block", () => {
    const workspace = new Blockly.Workspace();
    const imported = workspace.newBlock("visual_python_pandas_import");
    imported.setFieldValue("表格", "ALIAS");
    const frame = workspace.newBlock("visual_python_pandas_dataframe");
    frame.getInput("DATA")!.connection!.connect(workspace.newBlock("python_raw_expression").outputConnection!);
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("import pandas as 表格");
    expect(code).toContain("表格.DataFrame");
    expect(code).not.toContain("import pandas as pd");
    workspace.dispose();
  });

  it("generates CSV, shape, sorting, summary, and column assignment operations", () => {
    const workspace = new Blockly.Workspace();
    const read = workspace.newBlock("visual_python_pandas_read_csv");
    workspace.newBlock("visual_python_pandas_to_csv");
    workspace.newBlock("visual_python_pandas_read_excel");
    workspace.newBlock("visual_python_pandas_to_excel");
    const head = workspace.newBlock("visual_python_pandas_head");
    head.getInput("DATAFRAME")!.connection!.connect(read.outputConnection!);
    const shape = workspace.newBlock("visual_python_pandas_shape");
    shape.getInput("DATAFRAME")!.connection!.connect(read.outputConnection!);
    const sort = workspace.newBlock("visual_python_pandas_sort_values");
    sort.getInput("DATAFRAME")!.connection!.connect(read.outputConnection!);
    const assign = workspace.newBlock("visual_python_pandas_set_column");
    assign.getInput("DATAFRAME")!.connection!.connect(read.outputConnection!);
    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("pd.read_csv('data.csv')");
    expect(code).toContain("to_csv('data.csv', index=False)");
    expect(code).toContain("pd.read_excel('data.xlsx')");
    expect(code).toContain("to_excel('output.xlsx', index=False)");
    expect(code).toContain(".head(5)");
    expect(code).toContain(".shape");
    expect(code).toContain(".sort_values");
    expect(code).toContain("['新列']");
    workspace.dispose();
  });

  it("selects the Excel engine from a static file extension and leaves dynamic paths automatic", () => {
    const workspace = new Blockly.Workspace();
    const legacyExcel = workspace.newBlock("visual_python_pandas_read_excel");
    const legacyPath = workspace.newBlock("text");
    legacyPath.setFieldValue("records.xls", "TEXT");
    legacyExcel.getInput("PATH")!.connection!.connect(legacyPath.outputConnection!);

    const modernExcel = workspace.newBlock("visual_python_pandas_read_excel");
    const modernPath = workspace.newBlock("text");
    modernPath.setFieldValue("records.xlsx", "TEXT");
    modernExcel.getInput("PATH")!.connection!.connect(modernPath.outputConnection!);

    const dynamicExcel = workspace.newBlock("visual_python_pandas_read_excel");
    const dynamicPath = workspace.newBlock("python_raw_expression");
    dynamicPath.setFieldValue("file_path", "CODE");
    dynamicExcel.getInput("PATH")!.connection!.connect(dynamicPath.outputConnection!);

    const code = pythonGenerator.workspaceToCode(workspace);
    expect(code).toContain("pd.read_excel('records.xls', engine=\"xlrd\")");
    expect(code).toContain("pd.read_excel('records.xlsx', engine=\"openpyxl\")");
    expect(code).toContain("pd.read_excel(file_path)");
    workspace.dispose();
  });

  it("keeps every registered block namespaced and loads every toolbox block", () => {
    const blockTypes = registry.getBlockTypes(pandasPlugin.manifest.id);
    expect(blockTypes.length).toBeGreaterThanOrEqual(17);
    expect(blockTypes.every((type) => type.startsWith("visual_python_pandas_"))).toBe(true);
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const category = toolbox.contents.find((entry) => entry.name === "Pandas")!;
    const blocks = collectToolboxBlocks(category.contents);
    expect(blocks).toHaveLength(blockTypes.length);
    for (const entry of blocks) {
      const workspace = new Blockly.Workspace();
      const state = structuredClone(entry) as any;
      delete state.kind;
      expect(() => Blockly.serialization.blocks.append(state, workspace), entry.type).not.toThrow();
      workspace.dispose();
    }
  });

  it("organizes blocks into real child categories like the Turtle plugin", () => {
    const toolbox = registry.extendToolbox({ kind: "categoryToolbox", contents: [] }) as unknown as { contents: Array<Record<string, any>> };
    const pandasCategory = toolbox.contents.find((entry) => entry.name === "Pandas")!;
    const categories = pandasCategory.contents.filter((entry: Record<string, any>) => entry.kind === "category");
    expect(categories.map((entry: Record<string, any>) => entry.name)).toEqual([
      "创建与读取",
      "查看数据",
      "选择与整理",
    ]);
    expect(pandasCategory.colour).toBe("#4c8b6b");
    expect(categories.every((entry: Record<string, any>) => entry.colour === pandasCategory.colour)).toBe(true);
    expect(categories.every((entry: Record<string, any>) => entry.contents?.every((item: Record<string, any>) => item.kind === "block"))).toBe(true);
  });

  it("generates self-contained samples for every Pandas block", () => {
    const samples = registry.generatePythonSamples(pandasPlugin.manifest.id);
    expect(samples).toHaveLength(registry.getBlockTypes(pandasPlugin.manifest.id).length);
    expect(samples.every(({ code }) => code.includes("import pandas as pd"))).toBe(true);
    expect(pythonGenerator.forBlock.visual_python_pandas_shape(
      new Blockly.Workspace().newBlock("visual_python_pandas_shape"),
      pythonGenerator,
    )).toEqual(["pd.DataFrame().shape", Order.MEMBER]);
  });
});
