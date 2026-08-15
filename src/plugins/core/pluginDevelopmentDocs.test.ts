import { describe, expect, it } from "vitest";
import guideSource from "../../../docs/plugin-development/README.md?raw";
import guideHtmlSource from "../../../docs/plugin-development/plugin-development.html?raw";
import manimGuideHtmlSource from "../../../docs/manim-plugin/manim-plugin.html?raw";
import demoManifestSource from "../../../examples/external-plugins/demo-print/plugin.json?raw";
import demoPluginSource from "../../../examples/external-plugins/demo-print/index.js?raw";
import tauriSource from "../../../src-tauri/src/lib.rs?raw";

describe("plugin development documentation", () => {
  it("documents the current plugin API and external-plugin boundaries", () => {
    for (const method of [
      "registerBlock",
      "registerToolboxCategory",
      "registerSetting",
      "registerProjectSerializer",
      "registerCodeDocumentHandler",
      "registerCommand",
      "registerAgentTool",
      "reportProblem",
    ]) {
      expect(guideSource).toContain(method);
    }
    expect(guideSource).toContain("entry");
    expect(guideSource).toContain("自包含");
    expect(guideSource).toContain("512");
    expect(guideSource).toContain("50 MiB");
    expect(guideSource).toContain("requiresPermission");
    expect(guideSource).toContain("com.example.hello");
  });

  it("opens the bundled HTML guide instead of requiring a Markdown reader", () => {
    expect(guideHtmlSource.toLowerCase()).toContain("<!doctype html");
    expect(manimGuideHtmlSource.toLowerCase()).toContain("<!doctype html");
    expect(tauriSource).toContain('.join("plugin-development.html")');
    expect(tauriSource).toContain('.join("manim-plugin.html")');
  });

  it("keeps the documented minimal example executable", async () => {
    const manifest = JSON.parse(demoManifestSource);
    expect(manifest).toMatchObject({
      id: "visual-python.demo",
      apiVersion: "1",
      entry: "index.js",
    });

    const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(demoPluginSource)}`;
    const plugin = (await import(/* @vite-ignore */ moduleUrl)).default as {
      activate(context: Record<string, (...args: any[]) => void>): void;
    };
    const blocks: Array<Record<string, unknown>> = [];
    const categories: Array<Record<string, unknown>> = [];
    plugin.activate({
      registerBlock: (definition: Record<string, unknown>) => blocks.push(definition),
      registerToolboxCategory: (category: Record<string, unknown>) => categories.push(category),
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("visual_python_demo_print");
    expect(categories).toMatchObject([{ id: "visual-python.demo.toolbox", name: "输出示例" }]);
  });
});
