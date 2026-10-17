import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

describe("plugin draft runtime messages", () => {
  it("keeps user-facing plugin check messages free of double-encoded mojibake", () => {
    // 这些序列来自提交 3152488 引入的双重编码乱码，修好后不允许再出现。
    for (const fragment of ["鎻", "鎭㈠", "鎵句笉", "姝ｅ湪鍔犺浇", "婵€娲", "宸插仠"]) {
      expect(appSource).not.toContain(fragment);
    }
    for (const text of [
      "已停止生成",
      "找不到插件入口文件",
      "正在加载，请稍后重试",
      "已在当前会话中存在，请先停用或更换插件名称",
      "插件入口必须导出 activate(context)",
      "恢复插件失败：",
    ]) {
      expect(appSource).toContain(text);
    }
  });

  it("wires the toolbox reference check into the draft runtime checks", () => {
    expect(appSource).toContain("validatePluginToolboxReferences");
    expect(appSource).toContain("getToolboxCategories");
    expect(appSource).toContain('executedChecks.push("toolbox_references")');
    // 旧的硬编码 checks 清单是审计发现的“声明未实现”问题，不允许回退。
    expect(appSource).not.toContain('checks: ["activation", "toolbox", "block_samples", "python_syntax"]');
  });
});
