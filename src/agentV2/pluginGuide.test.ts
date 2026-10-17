import { describe, expect, it } from "vitest";
import { pluginGuideTableOfContents, pluginGuideTopLevelTitles, readPluginGuide } from "./pluginGuide";

describe("plugin development guide", () => {
  it("exposes the top-level section index for the contract", () => {
    expect(pluginGuideTopLevelTitles).toContain("一、快速开始");
    expect(pluginGuideTopLevelTitles).toContain("六、PluginContext API");
    expect(pluginGuideTopLevelTitles).toContain("十、调试与排错");
    expect(pluginGuideTopLevelTitles.length).toBe(11);
  });

  it("returns the table of contents when no section is requested", () => {
    const page = readPluginGuide();
    expect(page.found).toBe(true);
    expect(page.section).toBeNull();
    expect(page.content).toContain("## 一、快速开始");
    expect(page.content).toContain("### 5. 用 AI 助手创建插件（可选）");
    expect(page.truncated).toBe(false);
    expect(page.available).toEqual(pluginGuideTableOfContents);
  });

  it("reads a top-level section by full title or title fragment", () => {
    const exact = readPluginGuide({ section: "六、PluginContext API" });
    expect(exact.found).toBe(true);
    expect(exact.section).toBe("六、PluginContext API");
    expect(exact.content).toContain("registerBlock");
    expect(exact.content).toContain("registerToolboxCategory");

    const fragment = readPluginGuide({ section: "PluginContext" });
    expect(fragment.found).toBe(true);
    expect(fragment.section).toBe("六、PluginContext API");
  });

  it("reads a subsection by its heading", () => {
    const page = readPluginGuide({ section: "用 AI 助手创建插件" });
    expect(page.found).toBe(true);
    expect(page.section).toBe("5. 用 AI 助手创建插件（可选）");
    expect(page.content).toContain(".ai-ir.json");
    expect(page.content).toContain("apply_plugin_plan");
  });

  it("pages long sections with nextOffset", () => {
    const first = readPluginGuide({ section: "六、PluginContext API", maxChars: 200 });
    expect(first.found).toBe(true);
    expect(first.truncated).toBe(true);
    expect(first.nextOffset).toBe(200);
    expect(first.content.length).toBe(200);

    const second = readPluginGuide({ section: "六、PluginContext API", offset: first.nextOffset, maxChars: 200 });
    expect(second.offset).toBe(200);
    expect(second.content).not.toBe(first.content);

    const full = readPluginGuide({ section: "六、PluginContext API", maxChars: 8_000 });
    expect(full.truncated).toBe(false);
    expect(full.nextOffset).toBeUndefined();
    expect(full.totalChars).toBeGreaterThan(200);
  });

  it("lists available sections when the requested section is unknown", () => {
    const page = readPluginGuide({ section: "不存在的主题" });
    expect(page.found).toBe(false);
    expect(page.content).toBe("");
    expect(page.available).toContain("## 一、快速开始");
  });
});
