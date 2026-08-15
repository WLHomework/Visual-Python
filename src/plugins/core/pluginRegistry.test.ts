import { describe, expect, it, vi } from "vitest";
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
  it("registers and executes namespaced Agent tools only while active", async () => {
    const registry = new PluginRegistry();
    const execute = vi.fn().mockResolvedValue({ ok: true, value: 42 });
    registry.register({
      manifest: { id: "test.agent", name: "Agent", version: "1.0.0", apiVersion: PLUGIN_API_VERSION },
      activate(context) {
        context.registerAgentTool({
          id: "test.agent.inspect",
          definition: { type: "function", function: { name: "inspect_sample", description: "Inspect", parameters: { type: "object", properties: {} } } },
          label: "Inspect",
          readOnly: true,
          execute,
        });
      },
    });

    await registry.activate("test.agent");
    expect(registry.getAgentTools().map(({ tool }) => tool.definition.function.name)).toEqual(["inspect_sample"]);
    await expect(registry.executeAgentTool("inspect_sample", {}, () => ({ executeCapability: vi.fn() }), new AbortController().signal)).resolves.toEqual({ ok: true, value: 42 });
    await registry.deactivate("test.agent");
    expect(registry.getAgentTools()).toEqual([]);
  });

  it("exposes the actual registered Agent tool names for capability discovery", async () => {
    const registry = new PluginRegistry();
    registry.register({
      manifest: {
        id: "test.capability",
        name: "Capability",
        version: "1.0.0",
        apiVersion: PLUGIN_API_VERSION,
        agent: { description: "Sample capability", tools: ["stale_manifest_tool"] },
      },
      activate(context) {
        context.registerAgentTool({
          id: "test.capability.inspect",
          definition: { type: "function", function: { name: "inspect_live_state", description: "Inspect", parameters: { type: "object", properties: {} } } },
          label: "Inspect",
          readOnly: true,
        });
      },
    });

    await registry.activate("test.capability");

    expect(registry.getAgentToolNames("test.capability")).toEqual(["inspect_live_state"]);
  });

  it("resolves code document names through active plugin contributions", async () => {
    const registry = new PluginRegistry();
    registry.register({
      manifest: { id: "test.documents", name: "Documents", version: "1.0.0", apiVersion: PLUGIN_API_VERSION },
      activate(context) {
        context.registerCodeDocumentHandler({
          id: "test.documents.naming",
          matches: (code) => code.includes("PluginDocument"),
          name: () => "PluginDocument",
        });
      },
    });

    expect(registry.resolveCodeDocumentName("PluginDocument", "main")).toBe("main");
    await registry.activate("test.documents");
    expect(registry.resolveCodeDocumentName("PluginDocument", "main")).toBe("PluginDocument");
    await registry.deactivate("test.documents");
    expect(registry.resolveCodeDocumentName("PluginDocument", "main")).toBe("main");
  });

  it("binds Agent capability execution to the plugin that owns the tool", async () => {
    const registry = new PluginRegistry();
    registry.register({
      manifest: { id: "test.runtime", name: "Runtime", version: "1.0.0", apiVersion: PLUGIN_API_VERSION },
      activate(context) {
        context.registerAgentTool({
          id: "test.runtime.run",
          definition: { type: "function", function: { name: "run_sample", description: "Run", parameters: { type: "object", properties: {} } } },
          label: "Run",
          execute: (_args, runtime, signal) => runtime.executeCapability("run", {}, signal),
        });
      },
    });
    await registry.activate("test.runtime");
    const createRuntime = vi.fn((pluginId: string) => ({
      executeCapability: vi.fn().mockResolvedValue({ pluginId }),
    }));

    await expect(registry.executeAgentTool("run_sample", {}, createRuntime, new AbortController().signal)).resolves.toEqual({ pluginId: "test.runtime" });
    expect(createRuntime).toHaveBeenCalledWith("test.runtime");
  });

  it("rejects Agent tool names outside the plugin namespace", async () => {
    const registry = new PluginRegistry();
    registry.register({
      manifest: { id: "test.agent", name: "Agent", version: "1.0.0", apiVersion: PLUGIN_API_VERSION },
      activate(context) {
        context.registerAgentTool({
          id: "wrong",
          definition: { type: "function", function: { name: "wrong", description: "Wrong", parameters: { type: "object", properties: {} } } },
          label: "Wrong",
        });
      },
    });

    await registry.activate("test.agent");
    expect(registry.getRecord("test.agent")?.state).toBe("error");
  });
});
