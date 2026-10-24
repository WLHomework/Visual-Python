// 一次性复现：qwen3.7-flash 对深层嵌套 tool 参数是否会字符串化。
// 用法：node scripts/repro-tree-args.mjs（需要 DASHSCOPE_API_KEY）
const key = process.env.DASHSCOPE_API_KEY;
if (!key) {
  console.error("missing DASHSCOPE_API_KEY");
  process.exit(1);
}
const nodeSchema = {
  type: "object",
  properties: {
    type: { type: "string", minLength: 1 },
    fields: { type: "object", additionalProperties: { anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }] } },
    values: { type: "object", additionalProperties: true },
    statements: { type: "object", additionalProperties: { type: "array", items: { type: "object" } } },
    next: { type: "object" },
  },
  required: ["type"],
  additionalProperties: false,
};
const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model: process.argv[2] || "qwen3.8-flash",
    stream: false,
    enable_thinking: true,
    messages: [
      { role: "user", content: "调用 apply_block_program 工具，写入一个 hardware_controls_if 分支积木，其 statements DO 里放两个 hardware_pin_write 积木（PIN=2, VALUE=1 和 PIN=3, VALUE=0）。必须真的调用工具。" },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "apply_block_program",
          description: "Submit a nested program tree of blocks.",
          parameters: {
            type: "object",
            properties: {
              version: { const: 1 },
              mode: { type: "string", enum: ["append", "replace", "patch"] },
              tree: { oneOf: [nodeSchema, { type: "array", minItems: 1, items: nodeSchema }] },
            },
            required: ["tree"],
            additionalProperties: false,
          },
        },
      },
    ],
  }),
});
if (!res.ok) {
  console.error("HTTP", res.status, (await res.text()).slice(0, 500));
  process.exit(1);
}
const data = await res.json();
const call = data.choices?.[0]?.message?.tool_calls?.[0];
if (!call) {
  console.log("NO TOOL CALL. content:", String(data.choices?.[0]?.message?.content ?? "").slice(0, 300));
  process.exit(0);
}
const raw = call.function?.arguments ?? "";
console.log("RAW ARGUMENTS:");
console.log(raw);
try {
  const parsed = JSON.parse(raw);
  console.log("\ntype of parsed.tree:", typeof parsed.tree, Array.isArray(parsed.tree) ? "(array)" : "");
  if (typeof parsed.tree === "string") {
    console.log(">>> DOUBLE-ENCODED tree — model stringified the nested object.");
    console.log("inner parse ok:", (() => { try { JSON.parse(parsed.tree); return true; } catch { return false; } })());
  }
} catch (error) {
  console.log("outer JSON.parse failed:", error.message);
}
