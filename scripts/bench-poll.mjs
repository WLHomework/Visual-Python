// 基准进度轮询：node scripts/bench-poll.mjs [显示条数] [结果文件名]
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("docs/benchmarks/results");
const files = fs.readdirSync(dir).filter((f) => f.startsWith("ai-block-generation-")).sort();
const file = process.argv[3] ? process.argv[3] : files[files.length - 1];
const tailCount = Number(process.argv[2] || 3);
const d = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
console.log(`[${new Date().toLocaleTimeString()}] ${file} | model=${d.model} | done=${d.tasks.length}/32`);
for (const r of d.tasks.slice(-tailCount)) {
  console.log([r.id ?? r.taskId, r.status, r.writeTool ?? "-", `fb:${r.fallbackCount ?? "-"}`, `blk:${r.blockCount ?? "-"}`, `ctx:${r.contextIssues ?? "-"}`, `syn:${r.syntaxOk ?? "-"}`, `kw:${r.keywordPass ?? "-"}`, `${Math.round((r.durationMs || 0) / 1000)}s`].join(" | "));
}
console.log(JSON.stringify(d.tasks.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {})));
