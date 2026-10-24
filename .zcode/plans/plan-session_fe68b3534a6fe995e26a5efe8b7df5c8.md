# AI 编程助手对话管理 · 实施计划

按"先修正确性、再降成本、后动架构、最后补 UX"分四个阶段，每阶段独立提交、独立回归。

## 阶段 1：历史正确性（修问题 1+2，改动最小收益最大）

**目标**：停止的任务不再失忆；跨轮次能看见上一轮成功写入了什么。

`src/aiConversationContext.ts`：
- `buildAiConversationHistory` 的过滤条件从 `done || error` 扩为 `done || error || stopped`；stopped 轮次的 assistant 侧标注「任务被用户停止，已完成部分：…」，带上已发生的活动证据。
- `activityEvidence` 目前只收 error/codeChange（`:28`）；增加第三类：**成功的写入工具**（apply_python_as_blocks / apply_block_program / 代码编辑工具 done 且带 blockCount/changed），记录类型与规模——这是"基于已有积木继续修改"的关键上下文。

测试：`src/aiConversationContext.test.ts` 补两个用例（stopped 轮次保留；成功写入进入证据）。

## 阶段 2：token 预算与去重（修问题 9+10+11）

**目标**：预算从"字符"改为"估算 token"；同一内容不再双份注入；老图片不再反复计费。

- 新增 `src/agentV2/tokenEstimate.ts`：`estimateTokens(text)`（CJK 字符≈1 token、其余≈4 字符/token 的启发式）与 `historyTokenBudget`（保守默认值，预留按模型覆写的口子）。
- `src/agentV2/context.ts`：`historyMessages` 的 `maxContextHistoryCharacters`（24k 字符）改为 token 预算；`maxInitialRequestCharacters`/`maxBlockCatalogCharacters` 同步换算。
- `src/agentV2/memory.ts`：`createAgentMemory` 不再用最近 3 轮重复填充 facts/decisions（history 已含同样内容）；memory 只承载本轮运行中积累的 evidence/decisions，history 为空时才回退到旧行为。
- `src/AiAssistantPanel.tsx` `trimAiConversationHistory`：附件只在**最近一轮**保留原图，更早轮次仅保留文字元数据（"图片附件：a.png (800x600)"），截断也改 token 口径。

测试：`context.test.ts`（token 预算下最新轮次永不丢）、`AiAssistantPanel.test.tsx`（旧附件降级为元数据）、tokenEstimate 单测。

## 阶段 3：存储迁移（修问题 6+7+8，最大的一块）

**目标**：对话落 Tauri 文件系统（app-data），运行中增量持久化，崩溃不丢。

- Rust（`src-tauri/src/lib.rs`）：新增两条命令 `read_app_data_text(relative_path)` / `write_app_data_text(relative_path, contents)`，路径校验强制限制在 `ai-conversations/` 子目录内、禁 `..`，写走现有 `replace_file_atomically`（原子写，`lib.rs:717` 已有）。参照 `app_data_dir()` 现有用法（`lib.rs:3444` 等）。
- 前端新增 `src/conversationFileStore.ts`：异步 load/save，带 localStorage 回退（`npm run dev` 浏览器模式下仍可用）；单桶上限从 1.5M 提到 8M，保留现有降级阶梯作为兜底。
- `src/AiAssistantPanel.tsx`：初始化从「同步读 localStorage」改为「空状态起步 + effect 异步加载」（短暂骨架屏）；持久化时机从"非 running 才存"改为 **running 期间按活动批次防抖（约 2 秒）增量存**，序列化时 running→stopped 的现有换算保证重启后状态正确。
- 迁移：启动时若文件桶不存在而 localStorage 桶存在，写入文件后清掉 localStorage 旧桶（一次性，失败保留不阻塞）。
- 顺带：新增「导出对话为 JSON」菜单项（走现有保存对话框链路）与设置里的「清除全部 AI 对话记录」。

测试：Rust 端路径校验单测（仿 `lib.rs:8314` 现有 `#[cfg(test)]` 模式）；前端 fileStore 用假 invoke mock；sessionPersistence.test.ts 扩展迁移用例。

## 阶段 4：会话生命周期与杂项（修问题 3、4 与 UX 清单）

- 排队消息搁浅（`AiAssistantPanel.tsx:2054`）：finally 里 error 也链式启动下一个 queued（aborted 除外——用户主动停止则不自动继续）。
- 模型切换失忆提示（问题 3）：thread 未命中（换 baseUrl/model）时在交接提示词里加一句"上下文因模型切换已重置，以下是最近对话摘要"，让模型主动向用户说明，而非静默装懂。
- UX：会话菜单加每项删除按钮与时间戳；标题支持双击重命名（80 字内）；running 时允许「新建对话」（仅切换保持禁用，避免活动归属错乱）。
- 问题 5（多窗口互踩）**本轮不做**：应用单窗口（tauri.conf 无多窗口配置），理论性问题，记录到代码注释即可。

## 验收标准

- 全量 `npm test`（现有 1292 项全过 + 新增用例）与 `npx tsc --noEmit` 通过；`npm run tauri dev` 手测：停止任务后追问"继续"能接上、长任务中途强关应用重开记录仍在、对话可导出。
- 每阶段一个 commit（沿用中文短主题风格），阶段 3 单独跑一次 `npm run build` 确认 Rust/前端联动无误。

## 风险与对策

- 阶段 3 面板初始化改异步是最大回归点 → 保留 localStorage 读取路径作为加载失败的回退；骨架屏期间禁用输入。
- token 估算器是启发式 → 常量保守取值（宁少勿爆），并把预算集中到 tokenEstimate.ts 一处便于调参。
- 阶段 1 改变发给模型的历史内容 → 用基准 harness（BENCH_ONLY 挑 2-3 项）做一次前后对比冒烟，不跑全量（省 token）。