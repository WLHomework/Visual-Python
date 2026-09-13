import { describe, expect, it } from "vitest";
import { extractJsonString, isStreamingCodeTool, previewCodeFromStreamingTool } from "./streamingCodePreview";

describe("streaming code preview", () => {
  it("recognizes code-writing tools", () => {
    expect(isStreamingCodeTool("replace_code")).toBe(true);
    expect(isStreamingCodeTool("edit_code")).toBe(true);
    expect(isStreamingCodeTool("get_context")).toBe(false);
  });

  it("extracts a complete or truncated JSON string field", () => {
    expect(extractJsonString(`{"summary":"写文件","code":"print('ok')"}`, "code")).toBe("print('ok')");
    expect(extractJsonString(`{"code":"from manim import *\\nclass Demo`, "code")).toBe("from manim import *\nclass Demo");
  });

  it("previews replace_code as the file is streamed", () => {
    expect(previewCodeFromStreamingTool("replace_code", `{"code":"print(1`, "")).toBe("print(1");
    expect(previewCodeFromStreamingTool("replace_code", `{"code":"print(1)"}`, "")).toBe("print(1)");
  });

  it("previews completed edit_code replacements against the original file", () => {
    const baseline = "circle = Circle()\nself.add(circle)\n";
    const partial = `{"edits":[{"oldText":"self.add(circle)","newText":"self.play(Create(circle))"}]}`;
    expect(previewCodeFromStreamingTool("edit_code", partial, baseline)).toBe("circle = Circle()\nself.play(Create(circle))\n");
  });

  it("applies a truncated last newText when oldText is already complete", () => {
    const baseline = "self.wait(1)\n";
    const partial = `{"edits":[{"oldText":"self.wait(1)","newText":"self.wait(2`;
    expect(previewCodeFromStreamingTool("edit_code", partial, baseline)).toBe("self.wait(2\n");
  });
});
