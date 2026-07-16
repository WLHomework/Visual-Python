import { describe, expect, it } from "vitest";
import * as Blockly from "blockly/core";
import { pythonGenerator, Order } from "blockly/python";
import { PLUGIN_API_VERSION, type VisualPythonPlugin } from "../api/types";
import { PluginRegistry } from "./pluginRegistry";

const baseToolbox: Blockly.utils.toolbox.ToolboxDefinition = { kind: "categoryToolbox", contents: [] };

describe("PluginRegistry", () => {
  it("rejects incompatible manifests", () => {
    const registry = new PluginRegistry();
    expect(() => registry.register({
      manifest: { id: "test.invalid", name: "Invalid", version: "1.0.0", apiVersion: "999" },
      activate() {},
    })).toThrow("插件 API 不兼容");
  });

  it("activates namespaced block and toolbox contributions", async () => {
    const registry = new PluginRegistry();
    let loadedState: unknown;
    let cleared = false;
    const plugin: VisualPythonPlugin = {
      manifest: { id: "test.sample", name: "Sample", version: "1.0.0", apiVersion: PLUGIN_API_VERSION },
      activate(context) {
        context.registerBlock({ type: "test_sample_value", message0: "sample", output: null, colour: "#607d8b" }, () => ["'plugin'", Order.ATOMIC]);
        context.registerToolboxCategory({ id: "test.sample.toolbox", name: "Sample", colour: "#607d8b", contents: [{ kind: "block", type: "test_sample_value" }] });
        context.registerProjectSerializer({ id: "test.sample.project", save: () => ({ value: 42 }), load: (state) => { loadedState = state; }, clear: () => { cleared = true; } });
      },
    };
    registry.register(plugin);
    await registry.activate(plugin.manifest.id);
    expect(registry.getRecords()[0].state).toBe("active");
    expect((registry.extendToolbox(baseToolbox) as any).contents.at(-1).name).toBe("Sample");

    const workspace = new Blockly.Workspace();
    workspace.newBlock("test_sample_value");
    expect(pythonGenerator.workspaceToCode(workspace)).toBe("'plugin'\n");
    const projectState = registry.createProjectState(workspace);
    expect(projectState?.requirements).toEqual([{ id: "test.sample", version: "1.0.0" }]);
    expect(projectState?.data).toEqual({ "test.sample.project": { value: 42 } });
    registry.loadProjectData(projectState);
    expect(loadedState).toEqual({ value: 42 });
    registry.clearProjectData();
    expect(cleared).toBe(true);
    workspace.dispose();

    await registry.deactivate(plugin.manifest.id);
    expect(registry.getRecords()[0].state).toBe("disabled");
    expect(Blockly.Blocks.test_sample_value).toBeUndefined();
  });

  it("records activation errors for blocks outside the plugin namespace", async () => {
    const registry = new PluginRegistry();
    registry.register({
      manifest: { id: "test.namespace", name: "Namespace", version: "1.0.0", apiVersion: PLUGIN_API_VERSION },
      activate(context) { context.registerBlock({ type: "wrong_name", message0: "wrong" }, () => ""); },
    });
    await registry.activate("test.namespace");
    expect(registry.getRecords()[0].state).toBe("error");
    expect(registry.getProblems()[0].detail).toContain("积木类型必须以 test_namespace_ 开头");
  });
});
